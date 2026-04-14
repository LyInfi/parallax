import { test, expect } from '@playwright/test'

test('generate → favorite → gallery', async ({ page }) => {
  await page.goto('/settings')
  await page.getByLabel('Mock').fill('test-key')
  await page.getByRole('button', { name: /Save Mock/i }).click()

  await page.goto('/')
  // Add two mock cards
  for (let i = 0; i < 2; i++) {
    await page.locator('text=+').first().click()
    await page.getByRole('button', { name: 'Mock (Dev)' }).click()
  }
  await page.getByPlaceholder(/Describe/i).fill('a cat')
  await page.getByRole('button', { name: /Generate/i }).click()

  await expect(page.locator('img[alt^="Mock"]')).toHaveCount(2, { timeout: 15_000 })

  // Save favorite on first
  await page.getByRole('button', { name: '❤' }).first().click()

  await page.goto('/gallery')
  await expect(page.locator('section').filter({ hasText: 'All' }).locator('img')).toHaveCount(1)
})
