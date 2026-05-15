import { onScopeDispose, ref, shallowRef } from 'vue'
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
    // Lifecycle metadata only; shared reactive state still lives exclusively in
    // subscriptionMap entries.
    activeConsumers: Map<string, Set<ConsumerAttachment<unknown>>>
}

interface WaitingConsumer<T> {
    attach(sharedEntry: LiveQuerySubscriptionEntry<T>): void
}

interface ConsumerAttachment<T> {
    key: string
    scope: SubscriptionScope
    state: LiveQueryState<T>
    waitingConsumer: WaitingConsumer<T>
}

let browserSubscriptionScope: SubscriptionScope | undefined

export function createSubscriptionScope(): SubscriptionScope {
    return {
        subscriptionMap: new Map(),
        waitingConsumers: new Map(),
        activeConsumers: new Map(),
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
    configureEntry?: (entry: LiveQuerySubscriptionEntry<T>) => void,
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

    configureEntry?.(entry)

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
    moveActiveConsumersToWaiting(scope, entry.key)
}

export function resolveLiveQuerySubscription<T>(
    scope: SubscriptionScope,
    key: string,
): LiveQueryState<T> {
    const state = createLiveQueryState<T>(key)
    const attachment = createConsumerAttachment(scope, key, state)

    state.stop = () => {
        stopConsumerAttachment(attachment)
    }
    state.restart = () => {
        restartConsumerAttachment(attachment)
    }

    attachOrWaitForSharedState(attachment)

    onScopeDispose(() => {
        removeWaitingConsumer(scope, key, attachment.waitingConsumer)
        removeActiveConsumer(scope, key, attachment)
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

function addActiveConsumer<T>(
    scope: SubscriptionScope,
    key: string,
    attachment: ConsumerAttachment<T>,
): void {
    const consumers = scope.activeConsumers.get(key) ?? new Set()
    consumers.add(attachment as ConsumerAttachment<unknown>)
    scope.activeConsumers.set(key, consumers)
}

function removeActiveConsumer<T>(
    scope: SubscriptionScope,
    key: string,
    attachment: ConsumerAttachment<T>,
): void {
    const consumers = scope.activeConsumers.get(key)

    if (!consumers) {
        return
    }

    consumers.delete(attachment as ConsumerAttachment<unknown>)

    if (consumers.size === 0) {
        scope.activeConsumers.delete(key)
    }
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
    sharedEntry: LiveQuerySubscriptionEntry<T>,
): void {
    const waitingConsumers = scope.waitingConsumers.get(sharedEntry.key)

    if (!waitingConsumers) {
        return
    }

    for (const waitingConsumer of waitingConsumers) {
        ;(waitingConsumer as WaitingConsumer<T>).attach(sharedEntry)
    }

    scope.waitingConsumers.delete(sharedEntry.key)
}

function createConsumerAttachment<T>(
    scope: SubscriptionScope,
    key: string,
    state: LiveQueryState<T>,
): ConsumerAttachment<T> {
    const attachment = {
        key,
        scope,
        state,
        waitingConsumer: {
            attach: (sharedEntry: LiveQuerySubscriptionEntry<T>) => {
                attachToSharedState(attachment, sharedEntry)
            },
        },
    }

    return attachment
}

function attachOrWaitForSharedState<T>(
    attachment: ConsumerAttachment<T>,
): void {
    removeWaitingConsumer(
        attachment.scope,
        attachment.key,
        attachment.waitingConsumer,
    )
    removeActiveConsumer(attachment.scope, attachment.key, attachment)

    const entry = attachment.scope.subscriptionMap.get(attachment.key)

    if (entry) {
        attachToSharedState(attachment, entry as LiveQuerySubscriptionEntry<T>)
        return
    }

    applyWaitingDefaults(attachment.state)
    addWaitingConsumer(
        attachment.scope,
        attachment.key,
        attachment.waitingConsumer,
    )
}

function stopConsumerAttachment<T>(attachment: ConsumerAttachment<T>): void {
    removeWaitingConsumer(
        attachment.scope,
        attachment.key,
        attachment.waitingConsumer,
    )
    removeActiveConsumer(attachment.scope, attachment.key, attachment)
    applySnapshotDefaults(attachment.state)
}

function restartConsumerAttachment<T>(attachment: ConsumerAttachment<T>): void {
    attachOrWaitForSharedState(attachment)
}

function attachToSharedState<T>(
    attachment: ConsumerAttachment<T>,
    sharedEntry: LiveQuerySubscriptionEntry<T>,
): void {
    const { state } = attachment

    // Consumers share producer refs while active, but keep local controls so
    // they cannot stop or restart the producer-owned Dexie subscription.
    state.data = sharedEntry.data
    state.loading = sharedEntry.loading
    state.hasError = sharedEntry.hasError
    state.error = sharedEntry.error

    addActiveConsumer(attachment.scope, attachment.key, attachment)
}

function applyWaitingDefaults<T>(state: LiveQueryState<T>): void {
    state.data = shallowRef([])
    state.loading = ref(true)
    state.hasError = ref(false)

    if (state.error) {
        state.error = ref(undefined)
    }
}

function applySnapshotDefaults<T>(state: LiveQueryState<T>): void {
    const currentError = state.error?.value

    // Detaching replaces shared refs with local refs so later producer updates
    // no longer change this consumer's snapshot.
    state.data = shallowRef([...state.data.value])
    state.loading = ref(false)
    state.hasError = ref(state.hasError.value)

    if (state.error) {
        state.error = ref(currentError)
    }
}

function applySnapshotWaitingDefaults<T>(state: LiveQueryState<T>): void {
    // The consumer scope still exists, so keep useful UI data while marking that
    // producer ownership is temporarily missing for this key.
    state.data = shallowRef([...state.data.value])
    state.loading = ref(true)
    state.hasError = ref(false)

    if (state.error) {
        state.error = ref(undefined)
    }
}

function moveActiveConsumersToWaiting(
    scope: SubscriptionScope,
    key: string,
): void {
    const consumers = scope.activeConsumers.get(key)

    if (!consumers) {
        return
    }

    scope.activeConsumers.delete(key)

    for (const attachment of consumers) {
        applySnapshotWaitingDefaults(attachment.state)
        addWaitingConsumer(scope, key, attachment.waitingConsumer)
    }
}
