import type { LiveQueryState } from '../types'
import {
    resolveLiveQuerySubscription,
    resolveSubscriptionScope,
} from '../utils/subscriptionScope'

export function useLiveQuerySubscription<T>(key: string): LiveQueryState<T> {
    return resolveLiveQuerySubscription<T>(resolveSubscriptionScope(), key)
}
