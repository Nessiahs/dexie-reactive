import Dexie, { type EntityTable } from 'dexie'
import './styles.css'
import {
    createApp,
    defineComponent,
    h,
    nextTick,
    onErrorCaptured,
    ref,
} from 'vue'
import { useLiveQuery, useLiveQuerySubscription } from '../../src'

interface Friend {
    id?: number
    name: string
}

interface TestDatabase extends Dexie {
    friends: EntityTable<Friend, 'id'>
}

interface BrowserIntegrationApi {
    addFriend: (name: string) => Promise<void>
    cleanup: () => Promise<void>
    hideConsumer: () => Promise<void>
    showSecondConsumer: () => Promise<void>
    showConsumer: () => Promise<void>
    showDuplicateProducer: () => Promise<void>
}

declare global {
    interface Window {
        dexieReactiveTest: BrowserIntegrationApi
    }
}

const databaseName = 'dexie-reactive-browser'
const database = new Dexie(databaseName) as TestDatabase

database.version(1).stores({
    friends: '++id,name',
})

const isConsumerMounted = ref(true)
const isSecondConsumerMounted = ref(false)
const isDuplicateProducerMounted = ref(false)

const namesQuery = () => database.friends.orderBy('id').toArray()

const ProducerComponent = defineComponent({
    name: 'ProducerComponent',
    setup() {
        const state = useLiveQuery(namesQuery, { key: 'friends' })
        const newFriendName = ref('')

        const addFriend = async () => {
            const name = newFriendName.value.trim()

            if (!name) {
                return
            }

            await database.friends.add({ name })
            newFriendName.value = ''
        }

        return () =>
            h(
                'section',
                { class: 'panel producer', 'data-testid': 'producer' },
                [
                    h('div', { class: 'panel-header' }, [
                        h('div', [
                            h('p', { class: 'eyebrow' }, 'Producer'),
                            h('h2', 'useLiveQuery'),
                        ]),
                        h(StatusPill, {
                            hasError: state.hasError.value,
                            loading: state.loading.value,
                        }),
                    ]),
                    h(
                        'form',
                        {
                            class: 'entry-form',
                            onSubmit: (event: Event) => {
                                event.preventDefault()
                                void addFriend()
                            },
                        },
                        [
                            h('label', { class: 'field' }, [
                                h('span', 'Friend name'),
                                h('input', {
                                    'data-testid': 'producer-name-input',
                                    placeholder: 'Ada Lovelace',
                                    value: newFriendName.value,
                                    onInput: (event: Event) => {
                                        newFriendName.value = (
                                            event.target as HTMLInputElement
                                        ).value
                                    },
                                }),
                            ]),
                            h(
                                'button',
                                {
                                    class: 'primary-action',
                                    'data-testid': 'producer-add-button',
                                    type: 'submit',
                                },
                                'Add friend',
                            ),
                        ],
                    ),
                    h(FriendList, {
                        emptyLabel: 'No producer data yet',
                        names: state.data.value.map((friend) => friend.name),
                        outputTestId: 'producer-names',
                    }),
                    h('div', { class: 'debug-row' }, [
                        h('span', 'loading'),
                        h(
                            'output',
                            { 'data-testid': 'producer-loading' },
                            String(state.loading.value),
                        ),
                        h('span', 'hasError'),
                        h(
                            'output',
                            { 'data-testid': 'producer-error' },
                            String(state.hasError.value),
                        ),
                    ]),
                ],
            )
    },
})

const ConsumerComponent = defineComponent({
    name: 'ConsumerComponent',
    props: {
        controls: Boolean,
        testIdPrefix: {
            default: 'consumer',
            type: String,
        },
    },
    setup(props) {
        const state = useLiveQuerySubscription<Friend>('friends')

        return () => {
            const testId = props.testIdPrefix

            return h(
                'section',
                { class: 'panel subscriber', 'data-testid': testId },
                [
                    h('div', { class: 'panel-header' }, [
                        h('div', [
                            h('p', { class: 'eyebrow' }, 'Subscriber'),
                            h('h2', 'useLiveQuerySubscription'),
                        ]),
                        h(StatusPill, {
                            hasError: state.hasError.value,
                            loading: state.loading.value,
                        }),
                    ]),
                    props.controls
                        ? h('div', { class: 'control-row' }, [
                              h(
                                  'button',
                                  {
                                      'data-testid': `${testId}-stop-button`,
                                      onClick: () => {
                                          state.stop()
                                      },
                                      type: 'button',
                                  },
                                  'Stop',
                              ),
                              h(
                                  'button',
                                  {
                                      'data-testid': `${testId}-restart-button`,
                                      onClick: () => {
                                          state.restart()
                                      },
                                      type: 'button',
                                  },
                                  'Restart',
                              ),
                          ])
                        : null,
                    h(FriendList, {
                        emptyLabel: 'Waiting for shared state',
                        names: state.data.value.map((friend) => friend.name),
                        outputTestId: `${testId}-names`,
                    }),
                    h('div', { class: 'debug-row' }, [
                        h('span', 'loading'),
                        h(
                            'output',
                            { 'data-testid': `${testId}-loading` },
                            String(state.loading.value),
                        ),
                        h('span', 'hasError'),
                        h(
                            'output',
                            { 'data-testid': `${testId}-error` },
                            String(state.hasError.value),
                        ),
                    ]),
                ],
            )
        }
    },
})

const DuplicateProducerComponent = defineComponent({
    name: 'DuplicateProducerComponent',
    setup() {
        useLiveQuery(namesQuery, { key: 'friends' })
    },
    render() {
        return h('section', { 'data-testid': 'duplicate-producer' })
    },
})

const DuplicateProducerBoundary = defineComponent({
    name: 'DuplicateProducerBoundary',
    setup() {
        const message = ref('')

        onErrorCaptured((error) => {
            message.value =
                error instanceof Error ? error.message : String(error)

            return false
        })

        return () =>
            h(
                'section',
                {
                    class: 'duplicate-boundary',
                    'data-testid': 'duplicate-boundary',
                },
                [
                    isDuplicateProducerMounted.value
                        ? h(DuplicateProducerComponent)
                        : null,
                    h(
                        'output',
                        {
                            class: 'duplicate-error',
                            'data-testid': 'duplicate-error',
                        },
                        message.value,
                    ),
                ],
            )
    },
})

const RootComponent = defineComponent({
    name: 'RootComponent',
    setup() {
        return () =>
            h('main', { class: 'demo-shell' }, [
                h('header', { class: 'hero' }, [
                    h('p', { class: 'eyebrow' }, 'dexie-reactive'),
                    h('h1', 'Live query demo'),
                    h(
                        'p',
                        'Producer and subscriber components share one reactive Dexie live query state by key.',
                    ),
                ]),
                h('section', { class: 'demo-grid' }, [
                    h(ProducerComponent),
                    isConsumerMounted.value
                        ? h(ConsumerComponent, {
                              controls: true,
                              testIdPrefix: 'consumer',
                          })
                        : null,
                    isSecondConsumerMounted.value
                        ? h(ConsumerComponent, {
                              testIdPrefix: 'second-consumer',
                          })
                        : null,
                ]),
                h(DuplicateProducerBoundary),
            ])
    },
})

const StatusPill = defineComponent<{
    hasError: boolean
    loading: boolean
}>({
    name: 'StatusPill',
    props: {
        hasError: Boolean,
        loading: Boolean,
    },
    setup(props) {
        return () => {
            const label = props.hasError
                ? 'Error'
                : props.loading
                  ? 'Loading'
                  : 'Live'

            return h(
                'span',
                {
                    class: [
                        'status-pill',
                        props.hasError
                            ? 'is-error'
                            : props.loading
                              ? 'is-loading'
                              : 'is-live',
                    ],
                },
                label,
            )
        }
    },
})

const FriendList = defineComponent<{
    emptyLabel: string
    names: string[]
    outputTestId: string
}>({
    name: 'FriendList',
    props: {
        emptyLabel: {
            required: true,
            type: String,
        },
        names: {
            required: true,
            type: Array<string>,
        },
        outputTestId: {
            required: true,
            type: String,
        },
    },
    setup(props) {
        return () =>
            h('div', { class: 'friend-list' }, [
                props.names.length > 0
                    ? h(
                          'ul',
                          props.names.map((name) =>
                              h('li', { key: name }, name),
                          ),
                      )
                    : h('p', { class: 'empty-state' }, props.emptyLabel),
                h(
                    'output',
                    { class: 'sr-output', 'data-testid': props.outputTestId },
                    props.names.join(','),
                ),
            ])
    },
})

createApp(RootComponent).mount('#app')

window.dexieReactiveTest = {
    async addFriend(name: string) {
        await database.friends.add({ name })
    },
    async cleanup() {
        database.close()
        await deleteDatabase(databaseName)
    },
    async hideConsumer() {
        isConsumerMounted.value = false
        await nextTick()
    },
    async showSecondConsumer() {
        isSecondConsumerMounted.value = true
        await nextTick()
    },
    async showConsumer() {
        isConsumerMounted.value = true
        await nextTick()
    },
    async showDuplicateProducer() {
        isDuplicateProducerMounted.value = true
        await nextTick()
    },
}

function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name)

        request.onsuccess = () => {
            resolve()
        }
        request.onerror = () => {
            reject(request.error ?? new Error(`Failed to delete ${name}`))
        }
        request.onblocked = () => {
            reject(new Error(`Deleting ${name} was blocked`))
        }
    })
}
