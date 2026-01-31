# Subscription Setup Guide

## Overview

Peptide OS uses RevenueCat to manage subscriptions. This simplifies handling purchases, restores, and receipt validation across iOS.

## Step 1: Create RevenueCat Account

1. Go to https://app.revenuecat.com/signup
2. Create a free account
3. Create a new project called "Peptide OS"

## Step 2: Create Products in App Store Connect

Before connecting RevenueCat, you need to create the products in App Store Connect:

### 2.1 Create a Subscription Group

1. Go to https://appstoreconnect.apple.com
2. Select your app → "In-App Purchases" (under Monetization)
3. Click "Manage" → "Subscription Groups"
4. Click "+" to create a new group: "Peptide OS Premium"

### 2.2 Create Subscription Products

Create these three subscriptions in the group:

**Monthly Subscription:**
- Reference Name: Monthly Premium
- Product ID: `peptideos_monthly_699`
- Duration: 1 Month
- Price: $6.99

**Annual Subscription:**
- Reference Name: Annual Premium
- Product ID: `peptideos_annual_4999`
- Duration: 1 Year
- Price: $49.99

**Lifetime (Non-Consumable):**
For lifetime, create a Non-Consumable In-App Purchase:
- Reference Name: Lifetime Premium
- Product ID: `peptideos_lifetime_9999`
- Price: $99.99

### 2.3 Fill in Localization

For each product, add localization:
- Display Name: "Premium Monthly" / "Premium Annual" / "Premium Lifetime"
- Description: "Unlock all features of Peptide OS"

### 2.4 Review Information

Add a screenshot of the paywall for App Review.

## Step 3: Connect RevenueCat to App Store Connect

1. In RevenueCat dashboard, go to Project Settings → Apps
2. Click "Add New App" → Select "Apple App Store"
3. Enter:
   - App name: Peptide OS
   - Bundle ID: com.peptideos.app

4. Set up App Store Connect API Key:
   - In App Store Connect, go to Users & Access → Keys → App Store Connect API
   - Generate a new key with "Admin" access
   - Download the .p8 file (you can only download once!)
   - Note the Key ID and Issuer ID

5. In RevenueCat, enter:
   - Issuer ID
   - Key ID
   - Upload the .p8 file

## Step 4: Create Products in RevenueCat

1. In RevenueCat, go to Products
2. Click "New" and add each product:
   - Identifier: `peptideos_monthly_699` (must match App Store Connect)
   - App Store Product ID: Same as identifier

3. Repeat for annual and lifetime products

## Step 5: Create Entitlement

1. Go to Entitlements → "New"
2. Identifier: `premium`
3. Attach all three products to this entitlement

## Step 6: Create Offering

1. Go to Offerings → "New"
2. Identifier: `default`
3. Add packages:
   - Monthly: $monthly package with monthly product
   - Annual: $annual package with annual product
   - Lifetime: $lifetime package with lifetime product

## Step 7: Get API Key

1. In RevenueCat, go to Project Settings → API Keys
2. Copy the "Public app-specific API key" for iOS
3. Add to your environment:

```bash
# In Vercel environment variables:
NEXT_PUBLIC_REVENUECAT_API_KEY=appl_xxxxxxxxxxxxxxxx
```

## Step 8: Configure Capacitor

The code is already set up. Just add the API key and rebuild:

```bash
npx cap sync ios
npm run cap:open
```

## Step 9: Test Purchases

### Sandbox Testing

1. In App Store Connect, go to Users & Access → Sandbox → Testers
2. Create a sandbox tester account (use a fake email)
3. On your test device, sign out of your real Apple ID in Settings → App Store
4. When testing purchases, sign in with the sandbox account

### Testing Flow

1. Run the app on your device
2. Go to Settings
3. Tap "Upgrade"
4. Select a plan and complete purchase with sandbox account
5. Verify premium access is granted

## Pricing Recommendations

| Plan | Price | Apple's Cut | Your Revenue |
|------|-------|-------------|--------------|
| Monthly | $6.99 | 30% ($2.10) | $4.89 |
| Annual | $49.99 | 15%* ($7.50) | $42.49 |
| Lifetime | $99.99 | 30% ($30.00) | $69.99 |

*After year 1 with same subscriber, Apple's cut drops to 15%

## Revenue Projections

Assuming 1000 downloads/month with 5% conversion:

| Scenario | Monthly Revenue |
|----------|-----------------|
| All Monthly | $245 |
| 50% Annual | $1,180 |
| Mix (40M/50A/10L) | $820 |

## Common Issues

**Products not loading:**
- Ensure Bundle ID matches exactly
- Products must be "Ready to Submit" status
- Agreements must be signed in App Store Connect

**Purchases fail:**
- Check sandbox account is valid
- Ensure you're signed into sandbox, not production Apple ID

**RevenueCat not initializing:**
- Verify API key is correct
- Check that it's the iOS-specific public key
