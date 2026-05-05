import type { Ref } from 'vue'

export type MaybePromise<T> = T | Promise<T>

export type LiveQueryQueryFunction<T> = () => MaybePromise<T[]>

export interface UseLiveQueryOptions {
    key?: string
}

export interface LiveQueryState<T> {
    key: string
    data: Ref<T[]>
    loading: Ref<boolean>
    hasError: Ref<boolean>
    error?: Ref<unknown | undefined>
    stop: () => void
    restart: () => void
}

export type LiveQueryQuerySource<T> =
    | LiveQueryQueryFunction<T>
    | Ref<LiveQueryQueryFunction<T> | null | undefined>
    | null
    | undefined
