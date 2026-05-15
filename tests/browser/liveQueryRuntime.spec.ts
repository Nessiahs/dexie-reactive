import { expect, test } from '@playwright/test'

test.afterEach(async ({ page }) => {
    if (page.isClosed()) {
        return
    }

    await page
        .evaluate(() => window.dexieReactiveTest?.cleanup())
        .catch(() => undefined)
})

test('propagates Dexie updates to producer and shared consumer components', async ({
    page,
}) => {
    await page.goto('/')

    await expect(page.getByTestId('producer-error')).toHaveText('false')
    await expect(page.getByTestId('consumer-error')).toHaveText('false')

    await page.getByTestId('producer-name-input').fill('Ada')
    await page.getByTestId('producer-add-button').click()

    await expect(page.getByTestId('producer-names')).toHaveText('Ada')
    await expect(page.getByTestId('consumer-names')).toHaveText('Ada')
    await expect(page.getByTestId('producer-name-input')).toHaveValue('')

    await page.evaluate(() => window.dexieReactiveTest.hideConsumer())
    await expect(page.getByTestId('consumer')).toHaveCount(0)

    await page.getByTestId('producer-name-input').fill('Grace')
    await page.getByTestId('producer-add-button').click()

    await expect(page.getByTestId('producer-names')).toHaveText('Ada,Grace')

    await page.evaluate(() => window.dexieReactiveTest.showConsumer())

    await expect(page.getByTestId('consumer-names')).toHaveText('Ada,Grace')
    await expect(page.getByTestId('consumer-error')).toHaveText('false')
})

test('stops and restarts one consumer without affecting shared producer updates', async ({
    page,
}) => {
    await page.goto('/')
    await page.evaluate(() => window.dexieReactiveTest.showSecondConsumer())

    await page.getByTestId('producer-name-input').fill('Ada')
    await page.getByTestId('producer-add-button').click()

    await expect(page.getByTestId('producer-names')).toHaveText('Ada')
    await expect(page.getByTestId('consumer-names')).toHaveText('Ada')
    await expect(page.getByTestId('second-consumer-names')).toHaveText('Ada')

    await page.getByTestId('consumer-stop-button').click()

    await page.getByTestId('producer-name-input').fill('Grace')
    await page.getByTestId('producer-add-button').click()

    await expect(page.getByTestId('producer-names')).toHaveText('Ada,Grace')
    await expect(page.getByTestId('second-consumer-names')).toHaveText(
        'Ada,Grace',
    )
    await expect(page.getByTestId('consumer-names')).toHaveText('Ada')
    await expect(page.getByTestId('consumer-loading')).toHaveText('false')

    await page.getByTestId('consumer-restart-button').click()

    await expect(page.getByTestId('consumer-names')).toHaveText('Ada,Grace')
    await expect(page.getByTestId('consumer-error')).toHaveText('false')
})

test('surfaces duplicate producer misuse in a real browser runtime', async ({
    page,
}) => {
    await page.goto('/')

    await page.evaluate(() => window.dexieReactiveTest.showDuplicateProducer())

    await expect(page.getByTestId('duplicate-error')).toContainText(
        'Duplicate live query producer for key "friends"',
    )

    await page.getByTestId('producer-name-input').fill('Ada')
    await page.getByTestId('producer-add-button').click()

    await expect(page.getByTestId('producer-names')).toHaveText('Ada')
    await expect(page.getByTestId('producer-error')).toHaveText('false')
})

test('propagates same-origin Dexie writes across browser tabs', async ({
    context,
    page,
}) => {
    const secondPage = await context.newPage()

    await page.goto('/')
    await secondPage.goto('/')

    await page.getByTestId('producer-name-input').fill('Ada')
    await page.getByTestId('producer-add-button').click()

    await expect(page.getByTestId('producer-names')).toHaveText('Ada')
    await expect(secondPage.getByTestId('producer-names')).toHaveText('Ada')
    await expect(secondPage.getByTestId('consumer-names')).toHaveText('Ada')

    await secondPage.close()
})
