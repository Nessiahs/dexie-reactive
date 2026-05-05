import { effectScope, isRef, ref } from 'vue'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import * as publicApi from '../src'
import {
    useLiveQuery,
    useLiveQuerySubscription,
    type LiveQueryState,
} from '../src'
import {
    resetBrowserSubscriptionScopeForTests,
    resolveSubscriptionScope,
} from '../src/utils/subscriptionScope'

interface MockLiveQuerySubscription<T> {
    query: () => T[] | Promise<T[]>
    observer: {
        next: (value: T[]) => void
        error: (error: unknown) => void
    }
    subscription: {
        unsubscribe: ReturnType<typeof vi.fn>
    }
}

const dexieMock = vi.hoisted(() => {
    const subscriptions: MockLiveQuerySubscription<unknown>[] = []

    return {
        liveQuery: vi.fn((query: () => unknown[] | Promise<unknown[]>) => ({
            subscribe: vi.fn(
                (observer: {
                    next: (value: unknown[]) => void
                    error: (error: unknown) => void
                }) => {
                    const subscription = {
                        unsubscribe: vi.fn(),
                    }

                    subscriptions.push({
                        query,
                        observer,
                        subscription,
                    })

                    return subscription
                },
            ),
        })),
        subscriptions,
    }
})

vi.mock('dexie', () => ({
    liveQuery: dexieMock.liveQuery,
}))

afterEach(() => {
    resetBrowserSubscriptionScopeForTests()
    dexieMock.liveQuery.mockClear()
    dexieMock.subscriptions.splice(0)
    vi.unstubAllGlobals()
})

describe('public API', () => {
    it('exports only the public composables at runtime', () => {
        expect(Object.keys(publicApi).sort()).toEqual([
            'useLiveQuery',
            'useLiveQuerySubscription',
        ])
    })

    it('exports useLiveQuery with the documented state shape', () => {
        const state = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        expect(state.key).toBe('friends')
        expect(isRef(state.data)).toBe(true)
        expect(state.data.value).toEqual([])
        expect(isRef(state.loading)).toBe(true)
        expect(state.loading.value).toBe(false)
        expect(isRef(state.hasError)).toBe(true)
        expect(state.hasError.value).toBe(false)
        expect(state.stop).toEqual(expect.any(Function))
        expect(state.restart).toEqual(expect.any(Function))
        expectTypeOf(state).toEqualTypeOf<LiveQueryState<{ id: string }>>()
    })

    it('exports useLiveQuerySubscription with the documented state shape', () => {
        const state = useLiveQuerySubscription<{ id: string }>('friends')

        expect(state.key).toBe('friends')
        expect(isRef(state.data)).toBe(true)
        expect(state.data.value).toEqual([])
        expect(isRef(state.loading)).toBe(true)
        expect(state.loading.value).toBe(true)
        expect(isRef(state.hasError)).toBe(true)
        expect(state.hasError.value).toBe(false)
        expect(state.stop).toEqual(expect.any(Function))
        expect(state.restart).toEqual(expect.any(Function))
        expectTypeOf(state).toEqualTypeOf<LiveQueryState<{ id: string }>>()
    })
})

describe('subscription scope coordination', () => {
    it('uses a browser singleton subscription map', () => {
        vi.stubGlobal('window', {})

        const firstScope = resolveSubscriptionScope()
        const secondScope = resolveSubscriptionScope()

        expect(firstScope).toBe(secondScope)
    })

    it('uses isolated subscription maps during SSR', () => {
        const firstScope = resolveSubscriptionScope()
        const secondScope = resolveSubscriptionScope()

        expect(firstScope).not.toBe(secondScope)
        expect(firstScope.subscriptionMap).not.toBe(secondScope.subscriptionMap)
    })

    it('attaches consumers immediately when the producer already exists', () => {
        vi.stubGlobal('window', {})

        const producer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        expect(consumer).toBe(producer)
        expect(consumer.data).toBe(producer.data)
        expect(consumer.loading).toBe(producer.loading)
        expect(consumer.hasError).toBe(producer.hasError)
    })

    it('synchronously attaches waiting consumers when a producer registers', () => {
        vi.stubGlobal('window', {})

        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        expect(consumer.loading.value).toBe(true)

        const producer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const scope = resolveSubscriptionScope()

        expect(consumer).not.toBe(producer)
        expect(consumer.data).toBe(producer.data)
        expect(consumer.loading).toBe(producer.loading)
        expect(consumer.hasError).toBe(producer.hasError)
        expect(scope.waitingConsumers.has('friends')).toBe(false)
    })

    it('attaches multiple waiting consumers to the same shared state references', () => {
        vi.stubGlobal('window', {})

        const firstConsumer = useLiveQuerySubscription<{ id: string }>(
            'friends',
        )
        const secondConsumer = useLiveQuerySubscription<{ id: string }>(
            'friends',
        )
        const producer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        expect(firstConsumer.data).toBe(producer.data)
        expect(secondConsumer.data).toBe(producer.data)
        expect(firstConsumer.loading).toBe(producer.loading)
        expect(secondConsumer.loading).toBe(producer.loading)
    })

    it('removes waiting consumers when their effect scope is disposed', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const componentScope = effectScope()

        componentScope.run(() => {
            useLiveQuerySubscription<{ id: string }>('friends')
        })

        expect(scope.waitingConsumers.get('friends')?.size).toBe(1)

        componentScope.stop()

        expect(scope.waitingConsumers.has('friends')).toBe(false)
    })

    it('removes producer entries when their effect scope is disposed', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const componentScope = effectScope()
        let producer: LiveQueryState<{ id: string }> | undefined

        componentScope.run(() => {
            producer = useLiveQuery(
                () => Promise.resolve([{ id: 'friend-1' }]),
                {
                    key: 'friends',
                },
            )
        })

        expect(scope.subscriptionMap.get('friends')).toBe(producer)

        componentScope.stop()

        expect(scope.subscriptionMap.has('friends')).toBe(false)
    })
})

describe('useLiveQuery producer lifecycle', () => {
    it('starts a Dexie liveQuery subscription in the browser', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(1)
        expect(state.loading.value).toBe(true)
        expect(state.hasError.value).toBe(false)
    })

    it('throws immediately when a duplicate producer uses an existing key', () => {
        vi.stubGlobal('window', {})

        useLiveQuery(() => Promise.resolve([{ id: 'friend-1' }]), {
            key: 'friends',
        })

        expect(() =>
            useLiveQuery(() => Promise.resolve([{ id: 'friend-2' }]), {
                key: 'friends',
            }),
        ).toThrow(
            'Duplicate live query producer for key "friends". Only one useLiveQuery producer may own a key; useLiveQuerySubscription(key) to consume existing shared state.',
        )
        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(1)
    })

    it('keeps the existing producer usable after a duplicate producer failure', () => {
        vi.stubGlobal('window', {})

        const producer = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        expect(() =>
            useLiveQuery(() => Promise.resolve([{ id: 'friend-2' }]), {
                key: 'friends',
            }),
        ).toThrow(/Duplicate live query producer for key "friends"/)

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])

        expect(producer.data.value).toEqual([{ id: 'friend-1' }])
        expect(useLiveQuerySubscription<{ id: string }>('friends')).toBe(
            producer,
        )
    })

    it('does not create a subscription when the query function is missing', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery(undefined, { key: 'friends' })

        expect(dexieMock.liveQuery).not.toHaveBeenCalled()
        expect(state.data.value).toEqual([])
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(false)
    })

    it('marks invalid query functions as errors without keeping a subscription', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery(42 as never, { key: 'friends' })

        expect(dexieMock.liveQuery).not.toHaveBeenCalled()
        expect(state.data.value).toEqual([])
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(true)
    })

    it('does not create a Dexie subscription during SSR', () => {
        const state = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        expect(dexieMock.liveQuery).not.toHaveBeenCalled()
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(false)
    })

    it('applies the first live query result and clears loading', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])

        expect(state.data.value).toEqual([{ id: 'friend-1' }])
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(false)
    })

    it('sets hasError and clears loading when the subscription errors', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const error = new Error('query failed')

        dexieMock.subscriptions[0]?.observer.error(error)

        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(true)
    })

    it('catches immediate liveQuery subscription failures internally', () => {
        vi.stubGlobal('window', {})
        dexieMock.liveQuery.mockImplementationOnce(() => {
            throw new Error('subscribe failed')
        })

        const state = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(true)
    })

    it('stops the active subscription and keeps current data', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        state.stop()

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()
        expect(state.data.value).toEqual([{ id: 'friend-1' }])
        expect(state.loading.value).toBe(false)
    })

    it('ignores stale results after stop is called', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        state.stop()
        dexieMock.subscriptions[0]?.observer.next([{ id: 'stale-friend' }])

        expect(state.data.value).toEqual([])
    })

    it('restarts with a full reset and a new subscription', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        state.restart()

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()
        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(2)
        expect(state.data.value).toEqual([])
        expect(state.loading.value).toBe(true)
        expect(state.hasError.value).toBe(false)
    })

    it('ignores stale results from stopped subscriptions', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const staleSubscription = dexieMock.subscriptions[0]

        state.restart()
        staleSubscription?.observer.next([{ id: 'stale-friend' }])
        dexieMock.subscriptions[1]?.observer.next([{ id: 'fresh-friend' }])

        expect(state.data.value).toEqual([{ id: 'fresh-friend' }])
    })

    it('resets and resubscribes when a reactive query function reference changes', () => {
        vi.stubGlobal('window', {})

        const query = ref(() => Promise.resolve([{ id: 'friend-1' }]))
        const state = useLiveQuery(query, { key: 'friends' })

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        query.value = () => Promise.resolve([{ id: 'friend-2' }])

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()
        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(2)
        expect(state.data.value).toEqual([])
        expect(state.loading.value).toBe(true)

        dexieMock.subscriptions[1]?.observer.next([{ id: 'friend-2' }])

        expect(state.data.value).toEqual([{ id: 'friend-2' }])
        expect(state.loading.value).toBe(false)
    })

    it('generates and returns a UUID key when no key is provided', () => {
        vi.stubGlobal('window', {})

        const firstState = useLiveQuery(() =>
            Promise.resolve([{ id: 'friend-1' }]),
        )
        const secondState = useLiveQuery(() =>
            Promise.resolve([{ id: 'friend-2' }]),
        )

        expect(firstState.key).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        )
        expect(secondState.key).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        )
        expect(firstState.key).not.toBe(secondState.key)
    })
})
