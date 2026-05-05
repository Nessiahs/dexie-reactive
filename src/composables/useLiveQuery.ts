import { onScopeDispose } from 'vue'
import { createLiveQueryState } from '../utils/createLiveQueryState'
import {
    registerLiveQueryProducer,
    resolveSubscriptionScope,
    unregisterLiveQueryProducer,
} from '../utils/subscriptionScope'
import type {
    LiveQueryQuerySource,
    LiveQueryState,
    UseLiveQueryOptions,
} from '../types'

export function useLiveQuery<T>(
    _queryFn?: LiveQueryQuerySource<T>,
    options: UseLiveQueryOptions = {},
): LiveQueryState<T> {
    const scope = resolveSubscriptionScope()
    const state = createLiveQueryState<T>(options.key ?? '')
    const entry = registerLiveQueryProducer(scope, state)

    onScopeDispose(() => {
        unregisterLiveQueryProducer(scope, entry)
    }, true)

    return entry
}
