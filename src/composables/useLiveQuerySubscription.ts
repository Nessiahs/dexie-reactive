import { createLiveQueryState } from '../utils/createLiveQueryState'
import type { LiveQueryState } from '../types'

export function useLiveQuerySubscription<T>(key: string): LiveQueryState<T> {
    return createLiveQueryState<T>(key)
}
