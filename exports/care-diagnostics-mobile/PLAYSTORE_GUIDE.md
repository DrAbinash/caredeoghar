# Care Diagnostics Mobile - PlayStore Submission Guide

## Overview

This is the **Care Diagnostics** Expo mobile app for online test booking and report viewing. It connects to your existing backend API (`/api/public/booking/*`).

## What You Get After Build

| File | Size | Purpose |
|------|------|---------|
| `*.aab` (Android App Bundle) | ~45-55 MB | Upload to PlayStore Console |
| `*.apk` (optional) | ~40-50 MB | Direct install for testing |

## Step 1: Prerequisites

1. **Install Node.js 20+** and `npm` or `pnpm`
2. **Install EAS CLI**: `npm install -g eas-cli`
3. **Create Expo account** at https://expo.dev/signup (free)
4. **Log in**: `eas login`

## Step 2: Configure Your Backend Domain

Edit `.env` (copy from `.env.example`):

```
EXPO_PUBLIC_DOMAIN=your-clinic-domain.com
```

This tells the app where to call your API (`https://your-domain.com/api/public/booking/...`).

## Step 3: Initialize EAS Project

```bash
cd care-diagnostics-mobile
eas init
# This creates an EAS project and links your app.json
```

## Step 4: Build the Android AAB (PlayStore-ready)

```bash
eas build --platform android --profile production
```

This runs on Expo's build servers and returns:
- A download link for the `.aab` file
- A QR code for OTA (over-the-air) updates

**Time**: ~15-30 minutes (build queue + compile time)

## Step 5: Submit to PlayStore (Manual or Auto)

### Option A: Manual Upload (Recommended for first time)

1. Go to [Google Play Console](https://play.google.com/console)
2. Create app → "Care Diagnostics"
3. Fill: App name, default language (English), app category (Medical)
4. Upload the `.aab` file to "Internal Testing" track
5. Add screenshots, feature graphic, short/long description
6. Fill content rating questionnaire
7. Publish to Internal Testing first

### Option B: Automatic via EAS Submit

```bash
eas submit --platform android --profile production
```

Requires `google-service-account-key.json` (see PlayStore Console → Setup → API Access).

## Step 6: Required PlayStore Assets

| Asset | Dimensions | What to prepare |
|-------|-----------|-----------------|
| App icon | 512x512 PNG | `assets/images/icon.png` (already included) |
| Feature graphic | 1024x500 PNG | Create in Canva/Figma |
| Phone screenshots | 1080x1920 (min 2) | Take from the app on a real phone |
| Tablet screenshots | 2048x1536 (optional) | If supporting tablets |
| Short description | 80 chars max | "Book diagnostic tests online" |
| Full description | 4000 chars max | Describe features (booking, reports, OTP login, payments) |
| Privacy policy URL | Link | Link to your privacy policy page |

## Step 7: PlayStore Settings

### Content Rating
- Category: **Medical** or **Health & Fitness**
- Content rating: **Everyone** (no sensitive content)

### Pricing & Distribution
- Free app
- Available in: India (or your target countries)
- Contains ads: **No**

### App Content
- Target age: All ages
- Data safety: Declare what data you collect (phone number for OTP)

## App Features (for description)

- **Book diagnostic tests online** - Select from clinic's test catalog
- **OTP login** - Secure phone-based authentication, no password needed
- **View lab reports** - Access your reports anytime
- **My Bookings** - Track all past and upcoming appointments
- **Doctor listings** - See available doctors at the clinic
- **Online payments** - Pay via Razorpay, PayU, PhonePe, BharatPe, or Cashfree
- **About the clinic** - View clinic info, contact, and location

## Backend Requirements

Your backend must expose these public endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/public/booking/config` | Returns `{enabled, gateway, allowedTestIds}` |
| `GET /api/public/booking/tests` | Returns available tests (filtered by whitelist) |
| `GET /api/public/booking/packages` | Returns test packages |
| `POST /api/public/booking/send-otp` | Sends 6-digit OTP to phone |
| `POST /api/public/booking/verify-otp` | Verifies OTP, returns token |
| `POST /api/public/booking` | Creates a booking |
| `GET /api/public/booking/my-bookings` | Returns user's bookings (auth token) |
| `GET /api/public/booking/my-reports` | Returns user's reports (auth token) |
| `GET /api/public/clinic-settings` | Returns clinic name, address, phone |

## Enabling Online Booking (ERP Admin)

1. Log into your **Diagnostic ERP** as admin
2. Go to **Settings > Online Booking**
3. Turn ON **Enable Online Booking**
4. Select which **tests** are available for online booking (or leave empty for all)
5. Configure **payment gateway** (Razorpay/PayU/PhonePe/BharatPe/Cashfree)
6. Save settings

## Troubleshooting

### Build fails
- Check `expo doctor` output: `npx expo-doctor`
- Ensure `expo` and `react-native` versions are compatible

### App can't connect to API
- Verify `EXPO_PUBLIC_DOMAIN` is set correctly
- Ensure your API has SSL (https://) — required for production
- Check CORS headers on backend

### Icons not showing
- This only affects the **web preview**. Icons render correctly on real Android devices.
- For production Android builds, all icon fonts are bundled natively.

## Updating the App

After publishing, push OTA updates without resubmitting:

```bash
eas update --branch production --message "Bug fixes"
```

Users get updates automatically on next app launch.

## Support

For Expo/EAS issues: https://docs.expo.dev
For backend API issues: Check your ERP logs at `/api/healthz`
