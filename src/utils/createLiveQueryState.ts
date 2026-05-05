import { ref, shallowRef } from 'vue'
import type { LiveQueryState } from '../types'

export function createLiveQueryState<T>(key: string): LiveQueryState<T> {
    return {
        key,
        data: shallowRef<T[]>([]),
        loading: ref(false),
        hasError: ref(false),
        stop: () => {},
        restart: () => {},
    }
}
