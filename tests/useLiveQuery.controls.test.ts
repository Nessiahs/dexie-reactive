import { getDexieMock } from './helpers/dexieMock'
import { describe, expect, it, vi } from 'vitest'
import { useLiveQuery } from '../src'

const dexieMock = getDexieMock()

describe('useLiveQuery stop and restart controls', () => {
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
})
