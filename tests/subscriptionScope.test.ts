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

        expect(consumer).not.toBe(producer)
        expect(consumer.data).toBe(producer.data)
        expect(consumer.loading).toBe(producer.loading)
        expect(consumer.hasError).toBe(producer.hasError)
        expect(consumer.stop).not.toBe(producer.stop)
        expect(consumer.restart).not.toBe(producer.restart)
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

    it('keeps consumer controls local after waiting consumers attach', () => {
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

        expect(consumer.stop).toBe(waitingStop)
        expect(consumer.restart).toBe(waitingRestart)
        expect(consumer.stop).not.toBe(producer.stop)
        expect(consumer.restart).not.toBe(producer.restart)

        consumer.stop()

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).not.toHaveBeenCalled()

        consumer.restart()

        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(1)
        expect(consumer.data).toBe(producer.data)
        expect(consumer.loading.value).toBe(true)
    })

    it('stops a consumer locally without affecting the producer or other consumers', () => {
        vi.stubGlobal('window', {})

        const producer = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const stoppedConsumer = useLiveQuerySubscription<{ id: string }>(
            'friends',
        )
        const activeConsumer = useLiveQuerySubscription<{ id: string }>(
            'friends',
        )

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        stoppedConsumer.stop()
        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-2' }])

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).not.toHaveBeenCalled()
        expect(producer.data.value).toEqual([{ id: 'friend-2' }])
        expect(activeConsumer.data.value).toEqual([{ id: 'friend-2' }])
        expect(stoppedConsumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(stoppedConsumer.loading.value).toBe(false)
    })

    it('keeps a stopped consumer error snapshot after later producer recovery', () => {
        vi.stubGlobal('window', {})
        vi.stubEnv('NODE_ENV', 'development')

        const producer = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const consumer = useLiveQuerySubscription<{ id: string }>('friends')
        const failure = new Error('Query failed')

        dexieMock.subscriptions[0]?.observer.error(failure)
        consumer.stop()
        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])

        expect(producer.hasError.value).toBe(false)
        expect(producer.data.value).toEqual([{ id: 'friend-1' }])
        expect(consumer.hasError.value).toBe(true)
        expect(consumer.error?.value).toBe(failure)
        expect(consumer.data.value).toEqual([])
        expect(consumer.loading.value).toBe(false)
    })

    it('reattaches a stopped consumer to the current shared state', () => {
        vi.stubGlobal('window', {})

        const producer = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        consumer.stop()
        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-2' }])
        consumer.restart()

        expect(consumer.data).toBe(producer.data)
        expect(consumer.loading).toBe(producer.loading)
        expect(consumer.hasError).toBe(producer.hasError)
        expect(consumer.data.value).toEqual([{ id: 'friend-2' }])
        expect(dexieMock.liveQuery).toHaveBeenCalledTimes(1)
    })

    it('registers a stopped consumer as waiting again when restarted without a producer', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        consumer.stop()

        expect(scope.waitingConsumers.has('friends')).toBe(false)
        expect(consumer.loading.value).toBe(false)

        consumer.restart()

        expect(scope.waitingConsumers.get('friends')?.size).toBe(1)
        expect(consumer.data.value).toEqual([])
        expect(consumer.loading.value).toBe(true)
        expect(consumer.hasError.value).toBe(false)
    })

    it('does not attach a stopped waiting consumer when a producer registers', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        consumer.stop()

        const producer = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])

        expect(scope.waitingConsumers.has('friends')).toBe(false)
        expect(consumer.data).not.toBe(producer.data)
        expect(consumer.data.value).toEqual([])
        expect(consumer.loading.value).toBe(false)
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

        expect(friendsConsumer).not.toBe(friendsProducer)
        expect(petsConsumer).not.toBe(petsProducer)
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

    it('removes active consumers when their effect scope is disposed', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const producer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const componentScope = effectScope()

        componentScope.run(() => {
            useLiveQuerySubscription<{ id: string }>('friends')
        })

        expect(scope.activeConsumers.get('friends')?.size).toBe(1)

        componentScope.stop()

        expect(scope.activeConsumers.has('friends')).toBe(false)
        expect(scope.subscriptionMap.get('friends')).toBe(producer)
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

    it('moves active consumers back to waiting with a snapshot when their producer scope is disposed', () => {
        vi.stubGlobal('window', {})
        vi.stubEnv('NODE_ENV', 'development')

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

        const consumer = useLiveQuerySubscription<{ id: string }>('friends')
        const failure = new Error('Query failed')

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        dexieMock.subscriptions[0]?.observer.error(failure)

        expect(consumer.data).toBe(producer?.data)
        expect(consumer.hasError.value).toBe(true)
        expect(consumer.error?.value).toBe(failure)

        componentScope.stop()

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()
        expect(scope.subscriptionMap.has('friends')).toBe(false)
        expect(scope.activeConsumers.has('friends')).toBe(false)
        expect(scope.waitingConsumers.get('friends')?.size).toBe(1)
        expect(consumer.data).not.toBe(producer?.data)
        expect(consumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(consumer.loading.value).toBe(true)
        expect(consumer.hasError.value).toBe(false)
        expect(consumer.error?.value).toBeUndefined()
    })

    it('resets a snapshot waiting consumer when it restarts without a producer', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const producerScope = effectScope()

        producerScope.run(() => {
            useLiveQuery(() => Promise.resolve([{ id: 'friend-1' }]), {
                key: 'friends',
            })
        })

        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        producerScope.stop()

        expect(consumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(consumer.loading.value).toBe(true)

        consumer.restart()

        expect(scope.waitingConsumers.get('friends')?.size).toBe(1)
        expect(consumer.data.value).toEqual([])
        expect(consumer.loading.value).toBe(true)
        expect(consumer.hasError.value).toBe(false)
    })

    it('reattaches snapshot waiting consumers to a replacement producer for the same key', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const firstProducerScope = effectScope()
        let firstProducer: LiveQueryState<{ id: string }> | undefined

        firstProducerScope.run(() => {
            firstProducer = useLiveQuery(
                () => Promise.resolve([{ id: 'friend-1' }]),
                {
                    key: 'friends',
                },
            )
        })

        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        firstProducerScope.stop()

        expect(consumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(consumer.loading.value).toBe(true)
        expect(scope.waitingConsumers.get('friends')?.size).toBe(1)

        const secondProducer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-2' }]),
            {
                key: 'friends',
            },
        )

        expect(consumer.data).not.toBe(firstProducer?.data)
        expect(consumer.data).toBe(secondProducer.data)
        expect(scope.waitingConsumers.has('friends')).toBe(false)
        expect(scope.activeConsumers.get('friends')?.size).toBe(1)

        dexieMock.subscriptions[1]?.observer.next([{ id: 'friend-2' }])

        expect(consumer.data.value).toEqual([{ id: 'friend-2' }])
        expect(consumer.loading.value).toBe(false)
    })

    it('moves multiple active consumers back to waiting and reattaches them together', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const producerScope = effectScope()

        producerScope.run(() => {
            useLiveQuery(() => Promise.resolve([{ id: 'friend-1' }]), {
                key: 'friends',
            })
        })

        const firstConsumer = useLiveQuerySubscription<{ id: string }>(
            'friends',
        )
        const secondConsumer = useLiveQuerySubscription<{ id: string }>(
            'friends',
        )

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        producerScope.stop()

        expect(scope.waitingConsumers.get('friends')?.size).toBe(2)
        expect(firstConsumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(secondConsumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(firstConsumer.loading.value).toBe(true)
        expect(secondConsumer.loading.value).toBe(true)

        const replacementProducer = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-2' }]),
            {
                key: 'friends',
            },
        )

        expect(firstConsumer.data).toBe(replacementProducer.data)
        expect(secondConsumer.data).toBe(replacementProducer.data)
        expect(scope.waitingConsumers.has('friends')).toBe(false)
        expect(scope.activeConsumers.get('friends')?.size).toBe(2)
    })

    it('does not move manually stopped consumers back to waiting on producer cleanup', () => {
        vi.stubGlobal('window', {})

        const scope = resolveSubscriptionScope()
        const producerScope = effectScope()

        producerScope.run(() => {
            useLiveQuery(() => Promise.resolve([{ id: 'friend-1' }]), {
                key: 'friends',
            })
        })

        const consumer = useLiveQuerySubscription<{ id: string }>('friends')

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        consumer.stop()
        producerScope.stop()

        expect(scope.waitingConsumers.has('friends')).toBe(false)
        expect(scope.activeConsumers.has('friends')).toBe(false)
        expect(consumer.data.value).toEqual([{ id: 'friend-1' }])
        expect(consumer.loading.value).toBe(false)
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
