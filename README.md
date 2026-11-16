# Octopus Sports Academy

Web app for booking swimming classes at condos in Malaysia.

- **Frontend:** HTML, CSS and vanilla JavaScript (no React/Angular), hash routing, mobile-first.
- **Backend:** Node.js + Express 5.
- **Database:** PostgreSQL (`pg` driver, pooled connections, indexed queries).
- **Auth:** bcrypt password hashing, signed httpOnly session cookie, email verification, password reset by email link. Log in with **email or phone**.
- **QR attendance:** the coach shows a QR code that rotates every 90 seconds. Students scan it to check in as on time or late.

## Setup

```bash
npm install
cp .env.example .env      # then edit DATABASE_URL, JWT_SECRET, SMTP_*
createdb octopus          # or create the database from pgAdmin
npm run migrate           # applies db/schema.sql
npm run dev               # or: npm start
```

Open http://localhost:3001

If `SMTP_HOST` is empty, verification and reset emails are printed to the server console, so you can test the flow without an email server.

## Roles

| Role    | Can do |
|---------|--------|
| student | Browse condos, join classes, manage family members, see own classes, check in with the QR, see own ratings |
| coach   | Show the QR for own sessions, mark attendance (manual fallback), rate students (reason required below 3 stars) |
| admin   | Create condos and classes, add sessions, assign roles (promote a user to coach), review class requests, see all low ratings |

Promote a user to admin for the first time directly in SQL:

```sql
UPDATE users SET role = 'admin', email_verified = TRUE WHERE email = 'you@example.com';
```

## Key rules implemented

- **Eligibility:** a participant must be within the class age range and have the same swimming level as the class (`src/services/eligibility.js`).
- **Capacity:** enrollment locks the class row, so two people cannot take the last seat at the same time.
- **Check-in window:** open from 30 minutes before the start until the class ends. Marked *late* after `LATE_AFTER_MINUTES` (default 5).
- **Countdown on My classes:** shows the time left; from 30 minutes before the start until the end it shows the *Scan coach QR code* button.
- **Ratings:** 1 to 5 stars. The server rejects anything below 3 stars without a reason.

## Scaling notes

- Stateless sessions (JWT cookie), so run several Node processes or instances behind a load balancer.
- Pool size is set with `PG_POOL_MAX`.
- Static assets are compressed and cached. The API is paginated by `limit` on list endpoints.
- Add a read replica or a CDN for images when traffic grows.

## Not built yet

- Visa payment (`POST /api/classes/:id/enroll` returns 501 in production until a payment provider is connected).
- Real-time condo chat (planned with Socket.IO or a Postgres-backed message table).
- Video call fallback for check-in.
- SMS/push alerts to the admin on new class requests.
- Mobile app packaging (the site is installable as a PWA; a manifest is included, icons still needed).
