import { effectScope, isRef } from 'vue'
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

afterEach(() => {
    resetBrowserSubscriptionScopeForTests()
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
