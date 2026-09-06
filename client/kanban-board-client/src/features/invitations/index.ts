/**
 * Barrel for the `invitations` feature. Re-exports the public
 * hooks so call sites can `import { useMyInvitationsQuery } from
 * "@/features/invitations"` without reaching into individual files.
 */
export {
  useMyInvitationsQuery,
  myInvitationsQueryKey,
} from "./useMyInvitationsQuery";
export { useAcceptInvitationMutation } from "./useAcceptInvitationMutation";
export { useDeclineInvitationMutation } from "./useDeclineInvitationMutation";
export { InvitationsInbox } from "./components/InvitationsInbox";
export type { BoardInvitation } from "./types";
