import { getDexieMock } from './helpers/dexieMock'
import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
    useLiveQuery,
    useLiveQuerySubscription,
    type LiveQueryState,
} from '../src'
import { resolveSubscriptionScope } from '../src/utils/subscriptionScope'

const dexieMock = getDexieMock()

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

    it('does not create a Dexie liveQuery subscription for waiting consumers', () => {
        vi.stubGlobal('window', {})

        useLiveQuerySubscription<{ id: string }>('friends')

        expect(dexieMock.liveQuery).not.toHaveBeenCalled()
    })

    it('keeps a waiting consumer inert while no producer exists', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        expect(scope.waitingConsumers.get('friends')?.size).toBe(1)
        expect(scope.subscriptionMap.has('friends')).toBe(false)
        expect(consumer.data.value).toEqual([])
        expect(consumer.loading.value).toBe(true)
        expect(consumer.hasError.value).toBe(false)
        expect(dexieMock.liveQuery).not.toHaveBeenCalled()
    })

    it('does not create a Dexie liveQuery subscription for consumers attached to an existing producer', () => {
        vi.stubGlobal('window', {})

        useLiveQuery(() => Promise.resolve([{ id: 'friend-1' }]), {
            key: 'friends',
        })
        dexieMock.liveQuery.mockClear()

        useLiveQuerySubscription<{ id: string }>('friends')

        expect(dexieMock.liveQuery).not.toHaveBeenCalled()
    })

    it('shares producer-owned stop and restart from waiting consumers after attachment', () => {
        vi.stubGlobal('window', {})

        const consumer = useLiveQuerySubscription<{ id: string }>('friends')
        const waitingStop = consumer.stop
        const waitingRestart = consumer.restart
        const producer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        expect(consumer.stop).not.toBe(waitingStop)
        expect(consumer.restart).not.toBe(waitingRestart)
        expect(consumer.stop).toBe(producer.stop)
        expect(consumer.restart).toBe(producer.restart)

        consumer.stop()

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()

        consumer.restart()

        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(2)
        expect(consumer.data.value).toEqual([])
        expect(consumer.loading.value).toBe(true)
    })

    it('keeps producers and consumers isolated across different keys', () => {
        vi.stubGlobal('window', {})

        const friendsProducer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const petsProducer = useLiveQuery(
            () => Promise.resolve([{ id: 'pet-1' }]),
            {
                key: 'pets',
            },
        )

        const friendsConsumer = useLiveQuerySubscription<{ id: string }>(
            'friends',
        )
        const petsConsumer = useLiveQuerySubscription<{ id: string }>('pets')

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        dexieMock.subscriptions[1]?.observer.next([{ id: 'pet-1' }])

        expect(friendsConsumer).toBe(friendsProducer)
        expect(petsConsumer).toBe(petsProducer)
        expect(friendsConsumer.data).not.toBe(petsConsumer.data)
        expect(friendsConsumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(petsConsumer.data.value).toEqual([{ id: 'pet-1' }])
        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(2)
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

    it('unsubscribes and ignores stale updates when a producer scope is disposed', () => {
        vi.stubGlobal('window', {})

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

        componentScope.stop()
        dexieMock.subscriptions[0]?.observer.next([{ id: 'stale-friend' }])

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()
        expect(producer?.data.value).toEqual([])
    })
})
