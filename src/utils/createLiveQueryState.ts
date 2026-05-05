import { ref, shallowReactive, shallowRef } from 'vue'
import type { LiveQueryState } from '../types'

export function createLiveQueryState<T>(key: string): LiveQueryState<T> {
    return shallowReactive({
        key,
        data: shallowRef<T[]>([]),
        loading: ref(false),
        hasError: ref(false),
        stop: () => {},
        restart: () => {},
    })
}
