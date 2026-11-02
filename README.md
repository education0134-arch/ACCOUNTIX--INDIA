# ACCOUNTIX INDIA — starter project

A professional responsive website starter with:
- Public pages/services/courses (no visitor login required)
- Admin dashboard on the same website (`/admin`)
- Admin email OTP and phone OTP (SMTP + Twilio credentials required)
- Editable service names/descriptions/prices
- Courses are always free (no premium or course-price controls)
- Service enquiry buttons open WhatsApp directly; service prices are not displayed
- Comments, likes, views, shares and download events
- AdSense publisher settings
- SQLite database

## Run locally
1. Install Node.js 20+.
2. Open this folder in VS Code.
3. Run `npm install`
4. Copy `.env.example` to `.env` and fill in values.
5. Set `ADMIN_EMAIL` and `ADMIN_PHONE` to your owner credentials.
6. Set `WHATSAPP_NUMBER` to your WhatsApp number in international format with digits only (example: `919876543210`, no `+`).
6. Run `npm start`
7. Open `http://localhost:3000`

## Admin login
Open `http://localhost:3000/admin`. Request OTP. The OTP is sent to the configured admin email and phone. Both SMTP and Twilio must be configured for email + SMS OTP. Never deploy with example credentials.

## Important
This is a functional starter/MVP, not a production-ready tax filing platform. Before public deployment:
- Configure SMTP, Twilio, HTTPS, backups, strong secrets and hosting.
- This version keeps all courses free and does not include paid course checkout.
- Get legal/tax review for tax/GST services, privacy policy, terms, disclaimers and data retention.
- Do not collect PAN, Aadhaar, bank credentials or tax documents until you have secure workflows and appropriate compliance.
- AdSense approval is controlled by Google and does not guarantee revenue.
- Admin phone OTP is via Twilio SMS; Twilio trial accounts may only send to verified recipients.
