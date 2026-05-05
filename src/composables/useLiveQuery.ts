import { liveQuery } from 'dexie'
import { isRef, onScopeDispose, watch } from 'vue'
import { createLiveQueryState } from '../utils/createLiveQueryState'
import {
    type LiveQuerySubscriptionEntry,
    registerLiveQueryProducer,
    resolveSubscriptionScope,
    unregisterLiveQueryProducer,
} from '../utils/subscriptionScope'
import type {
    LiveQueryQueryFunction,
    LiveQueryQuerySource,
    LiveQueryState,
    UseLiveQueryOptions,
} from '../types'

interface DexieSubscription {
    unsubscribe: () => void
}

export function useLiveQuery<T>(
    queryFn?: LiveQueryQuerySource<T>,
    options: UseLiveQueryOptions = {},
): LiveQueryState<T> {
    const scope = resolveSubscriptionScope()
    const state = createLiveQueryState<T>(options.key ?? crypto.randomUUID())
    const entry = registerLiveQueryProducer(scope, state)
    let subscription: DexieSubscription | undefined
    let latestQueryFn: unknown = resolveQueryFunction(queryFn)

    const resetState = () => {
        entry.data.value = []
        entry.loading.value = true
        entry.hasError.value = false
        clearError(entry)
    }

    const stopSubscription = () => {
        subscription?.unsubscribe()
        subscription = undefined
        incrementGeneration(entry)
        entry.loading.value = false
    }

    const startSubscription = () => {
        stopSubscription()

        const query = latestQueryFn

        if (!query) {
            applyInactiveDefaults(entry)
            return
        }

        if (typeof query !== 'function') {
            applyInactiveErrorDefaults(entry)
            return
        }

        resetState()
        const generation = incrementGeneration(entry)

        if (typeof window === 'undefined') {
            entry.loading.value = false
            return
        }

        try {
            const observable = liveQuery(() =>
                (query as LiveQueryQueryFunction<T>)(),
            )

            subscription = observable.subscribe({
                next: (result) => {
                    if (!isLatestGeneration(entry, generation)) {
                        return
                    }

                    applyResultDefaults(entry, result)
                },
                error: (error) => {
                    if (!isLatestGeneration(entry, generation)) {
                        return
                    }

                    applyErrorDefaults(entry, error)
                },
            })
        } catch (error) {
            if (!isLatestGeneration(entry, generation)) {
                return
            }

            applyErrorDefaults(entry, error)
        }
    }

    entry.stop = stopSubscription
    entry.restart = () => {
        latestQueryFn = resolveQueryFunction(queryFn)
        startSubscription()
    }

    if (isRef(queryFn)) {
        watch(
            queryFn,
            (nextQueryFn) => {
                latestQueryFn = nextQueryFn
                startSubscription()
            },
            { flush: 'sync' },
        )
    }

    startSubscription()

    onScopeDispose(() => {
        stopSubscription()
        unregisterLiveQueryProducer(scope, entry)
    }, true)

    return entry
}

function resolveQueryFunction<T>(
    queryFn: LiveQueryQuerySource<T>,
): LiveQueryQueryFunction<T> | null | undefined {
    return isRef(queryFn) ? queryFn.value : queryFn
}

function incrementGeneration<T>(entry: LiveQuerySubscriptionEntry<T>): number {
    // Subscription callbacks can arrive after unsubscribe; generation gates them out.
    entry.producer.generation += 1
    return entry.producer.generation
}

function isLatestGeneration<T>(
    entry: LiveQuerySubscriptionEntry<T>,
    generation: number,
): boolean {
    return entry.producer.active && entry.producer.generation === generation
}

function clearError<T>(entry: LiveQuerySubscriptionEntry<T>): void {
    if (entry.error) {
        entry.error.value = undefined
    }
}

function applyInactiveDefaults<T>(entry: LiveQuerySubscriptionEntry<T>): void {
    entry.data.value = []
    entry.loading.value = false
    entry.hasError.value = false
    clearError(entry)
}

function applyInactiveErrorDefaults<T>(
    entry: LiveQuerySubscriptionEntry<T>,
): void {
    applyInactiveDefaults(entry)
    entry.hasError.value = true
}

function applyErrorDefaults<T>(
    entry: LiveQuerySubscriptionEntry<T>,
    error: unknown,
): void {
    entry.loading.value = false
    entry.hasError.value = true
    setError(entry, error)
}

function applyResultDefaults<T>(
    entry: LiveQuerySubscriptionEntry<T>,
    result: unknown,
): void {
    entry.data.value = Array.isArray(result) ? result : []
    entry.loading.value = false
    entry.hasError.value = false
    clearError(entry)
}

function setError<T>(
    entry: LiveQuerySubscriptionEntry<T>,
    error: unknown,
): void {
    if (entry.error) {
        entry.error.value = error ?? undefined
    }
}
