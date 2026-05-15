import { afterEach, vi } from 'vitest'
import { resetBrowserSubscriptionScopeForTests } from '../../src/utils/subscriptionScope'

interface MockLiveQuerySubscription<T> {
    query: () => T[] | Promise<T[]>
    observer: {
        next: (value: T[]) => void
        error: (error: unknown) => void
    }
    subscription: {
        unsubscribe: ReturnType<typeof vi.fn>
    }
}

const dexieMock = vi.hoisted(() => {
    const subscriptions: MockLiveQuerySubscription<unknown>[] = []

    return {
        liveQuery: vi.fn((query: () => unknown[] | Promise<unknown[]>) => ({
            subscribe: vi.fn(
                (observer: {
                    next: (value: unknown[]) => void
                    error: (error: unknown) => void
                }) => {
                    const subscription = {
                        unsubscribe: vi.fn(),
                    }

                    subscriptions.push({
                        query,
                        observer,
                        subscription,
                    })

                    return subscription
                },
            ),
        })),
        subscriptions,
    }
})

vi.mock('dexie', () => ({
    liveQuery: dexieMock.liveQuery,
}))

afterEach(() => {
    resetBrowserSubscriptionScopeForTests()
    dexieMock.liveQuery.mockClear()
    dexieMock.subscriptions.splice(0)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

export function getDexieMock(): typeof dexieMock {
    return dexieMock
}
