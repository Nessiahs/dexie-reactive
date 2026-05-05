import { ref, shallowReactive, shallowRef } from 'vue'
import type { LiveQueryState } from '../types'

export function createLiveQueryState<T>(key: string): LiveQueryState<T> {
    const state = shallowReactive({
        key,
        data: shallowRef<T[]>([]),
        loading: ref(false),
        hasError: ref(false),
        stop: () => {},
        restart: () => {},
    }) as LiveQueryState<T>

    if (isDevelopmentEnvironment()) {
        state.error = ref(undefined)
    }

    return state
}

function isDevelopmentEnvironment(): boolean {
    const runtime = globalThis as typeof globalThis & {
        process?: {
            env?: {
                NODE_ENV?: string
            }
        }
    }

    return runtime.process?.env?.NODE_ENV === 'development'
}
