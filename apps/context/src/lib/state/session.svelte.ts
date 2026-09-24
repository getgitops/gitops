import { currentUser, organizations, unreadNotifications } from '$lib/mock/users';

/** Signed-in user and active organization (mocked, never persisted). */
class Session {
	user = currentUser;
	organizations = organizations;
	orgSlug = $state(organizations[0].slug);
	unread = $state(unreadNotifications);

	get org() {
		return this.organizations.find((o) => o.slug === this.orgSlug) ?? this.organizations[0];
	}

	switchOrg(slug: string) {
		this.orgSlug = slug;
	}
}

export const session = new Session();
