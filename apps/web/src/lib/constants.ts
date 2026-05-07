/**
 * Shared constants for the application
 * Can be imported by both client and server code
 */

/**
 * Maximum number of videos allowed for anonymous users in local mode
 * This limit is enforced server-side in the CreateVideoUseCase
 */
export const MAX_LOCAL_VIDEOS = 5;

/**
 * Maximum media duration allowed for anonymous and non-member users.
 * Duration is measured in seconds and enforced in CreateVideoUseCase.
 */
export const MAX_RESTRICTED_MEDIA_DURATION_SECONDS = 30 * 60;
export const MAX_RESTRICTED_MEDIA_DURATION_MINUTES = 30;
