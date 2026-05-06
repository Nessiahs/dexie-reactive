import { getDexieMock } from './helpers/dexieMock'
import { describe, expect, it, vi } from 'vitest'
import { useLiveQuery, useLiveQuerySubscription } from '../src'

const dexieMock = getDexieMock()

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

    it('executes the query only through the Dexie liveQuery callback', async () => {
        vi.stubGlobal('window', {})

        const query = vi.fn(() => Promise.resolve([{ id: 'friend-1' }]))

        useLiveQuery(query, {
            key: 'friends',
        })

        expect(query).not.toHaveBeenCalled()

        await expect(dexieMock.subscriptions[0]?.query()).resolves.toEqual([
            { id: 'friend-1' },
        ])
        expect(query).toHaveBeenCalledOnce()
    })

    it('normalizes non-array live query results to an empty array', () => {
        vi.stubGlobal('window', {})

        const state = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        dexieMock.subscriptions[0]?.observer.next({ id: 'friend-1' } as never)

        expect(state.data.value).toEqual([])
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(false)
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
