import { getDexieMock } from './helpers/dexieMock'
import { describe, expect, it, vi } from 'vitest'
import { useLiveQuery } from '../src'

const dexieMock = getDexieMock()

describe('useLiveQuery error handling', () => {
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

    it('does not expose the original error outside development mode', () => {
        vi.stubGlobal('window', {})
        vi.stubGlobal('process', { env: { NODE_ENV: 'production' } })

        const state = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )

        dexieMock.subscriptions[0]?.observer.error(new Error('query failed'))

        expect(state.hasError.value).toBe(true)
        expect(state.error).toBeUndefined()
    })

    it('exposes the original error in development mode', () => {
        vi.stubGlobal('window', {})
        vi.stubGlobal('process', { env: { NODE_ENV: 'development' } })

        const state = useLiveQuery(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const error = new Error('query failed')

        dexieMock.subscriptions[0]?.observer.error(error)

        expect(state.hasError.value).toBe(true)
        expect(state.error?.value).toBe(error)
    })

    it('clears the development error when a later result succeeds', () => {
        vi.stubGlobal('window', {})
        vi.stubGlobal('process', { env: { NODE_ENV: 'development' } })

        const state = useLiveQuery<{ id: string }>(
            () => Promise.resolve([{ id: 'friend-1' }]),
            {
                key: 'friends',
            },
        )
        const error = new Error('query failed')

        dexieMock.subscriptions[0]?.observer.error(error)
        dexieMock.subscriptions[0]?.observer.next([{ id: 'friend-1' }])

        expect(state.data.value).toEqual([{ id: 'friend-1' }])
        expect(state.loading.value).toBe(false)
        expect(state.hasError.value).toBe(false)
        expect(state.error?.value).toBeUndefined()
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
})
