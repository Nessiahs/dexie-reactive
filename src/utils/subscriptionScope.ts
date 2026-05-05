import { onScopeDispose } from 'vue'
import type { LiveQueryState } from '../types'
import { createLiveQueryState } from './createLiveQueryState'

export interface LiveQueryProducerMetadata {
    active: boolean
    generation: number
}

export interface LiveQuerySubscriptionEntry<T> extends LiveQueryState<T> {
    producer: LiveQueryProducerMetadata
}

export interface SubscriptionScope {
    subscriptionMap: Map<string, LiveQuerySubscriptionEntry<unknown>>
    waitingConsumers: Map<string, Set<WaitingConsumer<unknown>>>
}

interface WaitingConsumer<T> {
    attach: (entry: LiveQuerySubscriptionEntry<T>) => void
}

let browserSubscriptionScope: SubscriptionScope | undefined

export function createSubscriptionScope(): SubscriptionScope {
    return {
        subscriptionMap: new Map(),
        waitingConsumers: new Map(),
    }
}

export function resolveSubscriptionScope(): SubscriptionScope {
    if (typeof window === 'undefined') {
        return createSubscriptionScope()
    }

    browserSubscriptionScope ??= createSubscriptionScope()

    return browserSubscriptionScope
}

export function registerLiveQueryProducer<T>(
    scope: SubscriptionScope,
    state: LiveQueryState<T>,
): LiveQuerySubscriptionEntry<T> {
    if (scope.subscriptionMap.has(state.key)) {
        throw new Error(
            `Duplicate live query producer for key "${state.key}". Only one useLiveQuery producer may own a key; useLiveQuerySubscription(key) to consume existing shared state.`,
        )
    }

    const entry = Object.assign(state, {
        producer: {
            active: true,
            generation: 0,
        },
    }) as LiveQuerySubscriptionEntry<T>

    scope.subscriptionMap.set(
        entry.key,
        entry as LiveQuerySubscriptionEntry<unknown>,
    )
    emitSubscriptionRegistered(scope, entry)

    return entry
}

export function unregisterLiveQueryProducer<T>(
    scope: SubscriptionScope,
    entry: LiveQuerySubscriptionEntry<T>,
): void {
    const currentEntry = scope.subscriptionMap.get(entry.key)

    if (currentEntry !== entry) {
        return
    }

    entry.producer.active = false
    scope.subscriptionMap.delete(entry.key)
}

export function resolveLiveQuerySubscription<T>(
    scope: SubscriptionScope,
    key: string,
): LiveQueryState<T> {
    const entry = scope.subscriptionMap.get(key)

    if (entry) {
        return entry as LiveQuerySubscriptionEntry<T>
    }

    const state = createLiveQueryState<T>(key)
    state.loading.value = true

    const waitingConsumer: WaitingConsumer<T> = {
        attach: (registeredEntry) => {
            attachToSharedState(state, registeredEntry)
        },
    }

    addWaitingConsumer(scope, key, waitingConsumer)

    onScopeDispose(() => {
        removeWaitingConsumer(scope, key, waitingConsumer)
    }, true)

    return state
}

export function resetBrowserSubscriptionScopeForTests(): void {
    browserSubscriptionScope = undefined
}

function addWaitingConsumer<T>(
    scope: SubscriptionScope,
    key: string,
    waitingConsumer: WaitingConsumer<T>,
): void {
    const consumers = scope.waitingConsumers.get(key) ?? new Set()
    consumers.add(waitingConsumer as WaitingConsumer<unknown>)
    scope.waitingConsumers.set(key, consumers)
}

function removeWaitingConsumer<T>(
    scope: SubscriptionScope,
    key: string,
    waitingConsumer: WaitingConsumer<T>,
): void {
    const consumers = scope.waitingConsumers.get(key)

    if (!consumers) {
        return
    }

    consumers.delete(waitingConsumer as WaitingConsumer<unknown>)

    if (consumers.size === 0) {
        scope.waitingConsumers.delete(key)
    }
}

function emitSubscriptionRegistered<T>(
    scope: SubscriptionScope,
    entry: LiveQuerySubscriptionEntry<T>,
): void {
    const waitingConsumers = scope.waitingConsumers.get(entry.key)

    if (!waitingConsumers) {
        return
    }

    for (const waitingConsumer of waitingConsumers) {
        ;(waitingConsumer as WaitingConsumer<T>).attach(entry)
    }

    scope.waitingConsumers.delete(entry.key)
}

function attachToSharedState<T>(
    state: LiveQueryState<T>,
    entry: LiveQuerySubscriptionEntry<T>,
): void {
    state.data = entry.data
    state.loading = entry.loading
    state.hasError = entry.hasError
    state.error = entry.error
    state.stop = entry.stop
    state.restart = entry.restart
}
