# User Management

Users are managed exclusively through the Django admin panel. There is no
self-registration -- an operator creates accounts and users log in with the
credentials they receive.

## Accessing the Admin Panel

Navigate to `http://localhost:8000/admin/` and log in with a superuser account.
Create one if it doesn't exist:

```bash
uv run python manage.py createsuperuser
```

## Creating a New User

Navigate to **Authentication and Authorization > Users > Add user**. Required
fields are username and password (entered twice).

After creation, the edit page exposes additional fields: first name, last name,
email, and active status. The user can now log in to the walkie app with these
credentials.

A DRF auth token is automatically created on the user's first login via the API.
No manual token setup is needed.

## Modifying a User

Navigate to **Authentication and Authorization > Users** and click the username
to edit.

| Field | Notes |
| --- | --- |
| Username | Must be unique |
| First name / Last name / Email | Optional profile fields |
| Active | Uncheck to disable login without deleting the account |
| Staff status | Grants access to the admin panel |
| Superuser status | Grants full admin permissions |

To change a password, use the "change password form" link at the top of the user
edit page. Passwords are never displayed in plain text.

To deactivate a user without deleting their data, uncheck **Active**. This
prevents login while preserving favorites and other records.

## Deleting a User

Navigate to **Authentication and Authorization > Users**, select the user(s) via
checkbox, choose "Delete selected users" from the action dropdown, and confirm.

Deleting a user permanently removes their account, auth token, and all favorite
region associations (cascade delete). Prefer deactivation over deletion when data
preservation matters.

## Managing Auth Tokens

Navigate to **Auth Token > Tokens**. Each user has at most one token, created
automatically on first login.

To force a user to re-authenticate, delete their token. Their next API call
returns 401 and the frontend redirects them to the login page. A new token is
created automatically when they log in again.

## Managing Favorite Regions

Navigate to **Users > Favorite regions**. This view shows which users have
favorited which regions.

| Column | Description |
| --- | --- |
| User | The user who favorited the region |
| Region | The favorited region |
| Created at | When the favorite was added |

Use the filters sidebar to narrow by user or region. You can add or remove
favorites on behalf of users from this view.
