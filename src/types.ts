import type { MaybeRefOrGetter, Ref } from 'vue'

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
    stop: () => void
    restart: () => void
}

export type LiveQueryQuerySource<T> =
    | LiveQueryQueryFunction<T>
    | MaybeRefOrGetter<LiveQueryQueryFunction<T> | null | undefined>
    | null
    | undefined
