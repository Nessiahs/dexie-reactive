import { createLiveQueryState } from '../utils/createLiveQueryState'
import type {
    LiveQueryQuerySource,
    LiveQueryState,
    UseLiveQueryOptions,
} from '../types'

export function useLiveQuery<T>(
    _queryFn?: LiveQueryQuerySource<T>,
    options: UseLiveQueryOptions = {},
): LiveQueryState<T> {
    return createLiveQueryState<T>(options.key ?? '')
}
