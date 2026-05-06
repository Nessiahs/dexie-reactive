import './helpers/dexieMock'
import { isRef } from 'vue'
import { describe, expect, expectTypeOf, it } from 'vitest'
import * as publicApi from '../src'
import {
    useLiveQuery,
    useLiveQuerySubscription,
    type LiveQueryState,
} from '../src'

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
