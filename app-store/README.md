# App Store Submission Guide

## Files in this folder

- `description.md` - App Store listing copy (description, keywords, etc.)
- `icon.svg` - App icon source file
- `README.md` - This guide

## Step 1: Generate App Icon

Convert the SVG to a 1024x1024 PNG (no transparency, no alpha channel):

**Option A: Online converter**
1. Go to https://cloudconvert.com/svg-to-png
2. Upload `icon.svg`
3. Set dimensions to 1024x1024
4. Download the PNG

**Option B: Using macOS Preview**
1. Open `icon.svg` in Chrome/Safari
2. Right-click > Save Image As > PNG
3. Open in Preview, resize to 1024x1024

**Option C: Using Inkscape (free)**
```bash
inkscape icon.svg --export-type=png --export-filename=icon.png -w 1024 -h 1024
```

Then add the 1024x1024 PNG to Xcode:
1. Open your project in Xcode
2. Select `Assets.xcassets`
3. Select `AppIcon`
4. Drag the 1024x1024 PNG to the "App Store" slot
5. Xcode will generate all other sizes automatically

## Step 2: Take Screenshots

Open the app in iOS Simulator and take screenshots:

```bash
# Run specific simulator
xcrun simctl boot "iPhone 15 Pro Max"
open -a Simulator

# Take screenshot (saves to Desktop)
xcrun simctl io booted screenshot ~/Desktop/screenshot.png
```

**Required screenshot sizes:**
- iPhone 6.7" (1290 x 2796) - iPhone 15 Pro Max
- iPhone 6.5" (1284 x 2778) - iPhone 14 Plus

**Screenshots to take:**
1. Today view (with some completed doses)
2. Protocols list
3. Protocol detail/edit
4. Calendar view
5. Chat with AI
6. Inventory list
7. Reconstitution calculator

## Step 3: App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" > "+" > "New App"
3. Fill in:
   - Platform: iOS
   - Name: Peptide OS
   - Primary Language: English (U.S.)
   - Bundle ID: com.peptideos.app
   - SKU: peptideos-001

4. Upload app icon and screenshots
5. Copy description from `description.md`
6. Fill in:
   - Privacy Policy URL: https://peptide-os.vercel.app/privacy
   - Support URL: https://peptide-os.vercel.app/support
   - Category: Health & Fitness

## Step 4: Build & Upload from Xcode

1. In Xcode, select "Any iOS Device (arm64)"
2. Product > Archive
3. When archive completes, click "Distribute App"
4. Select "App Store Connect" > "Upload"
5. Follow prompts

## Step 5: Submit for Review

1. In App Store Connect, select your app
2. Go to the build section, select the uploaded build
3. Fill in "What's New" notes
4. Answer the export compliance questions (likely "No" for encryption)
5. Click "Submit for Review"

## Review Timeline

- First submission: 24-48 hours typically
- Updates: Often faster (same day to 24 hours)
- Rejections: You'll get specific feedback to address

## Common Rejection Reasons to Avoid

1. **Incomplete app** - Make sure all features work
2. **Broken links** - Test privacy policy and support URLs
3. **Health claims** - Don't claim to treat/cure anything
4. **Missing disclaimers** - Health disclaimer is in our terms
5. **Placeholder content** - Remove any "lorem ipsum" or test data
