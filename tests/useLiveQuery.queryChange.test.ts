import { getDexieMock } from './helpers/dexieMock'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useLiveQuery } from '../src'

const dexieMock = getDexieMock()

describe('useLiveQuery reactive query function changes', () => {
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

    it('ignores stale results across rapid query function reference changes', () => {
        vi.stubGlobal('window', {})

        const query = ref(() => Promise.resolve([{ id: 'friend-1' }]))
        const state = useLiveQuery(query, { key: 'friends' })

        query.value = () => Promise.resolve([{ id: 'friend-2' }])
        query.value = () => Promise.resolve([{ id: 'friend-3' }])

        dexieMock.subscriptions[0]?.observer.next([{ id: 'stale-friend-1' }])
        dexieMock.subscriptions[1]?.observer.next([{ id: 'stale-friend-2' }])
        dexieMock.subscriptions[2]?.observer.next([{ id: 'friend-3' }])

        expect(state.data.value).toEqual([{ id: 'friend-3' }])
        expect(state.loading.value).toBe(false)
    })

    it('resets to inactive defaults when a reactive query function becomes missing', () => {
        vi.stubGlobal('window', {})

        const query = ref<(() => Promise<{ id: string }[]>) | undefined>(() =>
            Promise.resolve([{ id: 'friend-1' }]),
        )
        const state = useLiveQuery(query, { key: 'friends' })

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        query.value = undefined

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()
        expect(state.data.value).toEqual([])
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(false)
    })

    it('resets to inactive error defaults when a reactive query function becomes invalid', () => {
        vi.stubGlobal('window', {})

        const query = ref<unknown>(() => Promise.resolve([{ id: 'friend-1' }]))
        const state = useLiveQuery(query as never, { key: 'friends' })

        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])
        query.value = 42

        expect(
            dexieMock.subscriptions[0]?.subscription.unsubscribe,
        ).toHaveBeenCalledOnce()
        expect(state.data.value).toEqual([])
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(true)
    })
})
