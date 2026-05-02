import Doctors from "@/pages/Doctors";

/**
 * Module A (compliance): the Referrals page used to expose Commission Report
 * and Commission Rules tabs alongside Doctors. To comply with regulations
 * around physician referral fees, all commission-related views were moved to
 * the Super Admin Portal. This page now only shows the Doctors directory; the
 * /referrals route is kept so existing sidebar links / staff-permission rows
 * stored in the DB do not break.
 */
export default function Referrals() {
  return <Doctors />;
}
