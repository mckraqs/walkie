# Getting Started

## What is Walkie?

Walkie is a web application that helps you discover walking routes in your area. You can
generate routes based on your preferred distance and route type, explore streets on an
interactive map, save your favorite routes, and track your walking progress.

## Logging In

1. Open the Walkie app in your browser
2. Enter your username and password on the login screen
3. Click "Login"

Your account is created by an administrator - there is no self-registration.

## Home Screen

The home page (`/`) redirects to `/explore`, which serves as the main entry point.

**Unauthenticated:** the explore page displays a login form with the app title and
a theme toggle (light/dark mode).

**Authenticated:** the explore page shows a header bar with:

- a district dropdown to filter regions by administrative district
- a region selector dropdown (grouped into favorites and other regions)
- a favorite toggle (star icon) to add or remove the selected region from favorites
- a walked counter badge showing your progress in the region
- your username and a "Logout" button
- a theme toggle (light/dark mode)

Select a region from the dropdown to start exploring.
