import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import { readStaffSession, canAccess, firstPermissionedPath, firstAllowedPath, longestMatchingNavPath, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import { useEffect } from "react";

const BillingDesk     = lazy(() => import("@/pages/BillingDesk"));
const Dashboard       = lazy(() => import("@/pages/Dashboard"));
const Patients        = lazy(() => import("@/pages/Patients"));
const PatientDetail   = lazy(() => import("@/pages/PatientDetail"));
const Tests           = lazy(() => import("@/pages/Tests"));
const Orders          = lazy(() => import("@/pages/Orders"));
const OrderDetail     = lazy(() => import("@/pages/OrderDetail"));
const Billing         = lazy(() => import("@/pages/Billing"));
const BillDetail      = lazy(() => import("@/pages/BillDetail"));
const Payments        = lazy(() => import("@/pages/Payments"));
const Doctors         = lazy(() => import("@/pages/Doctors"));
const Reports         = lazy(() => import("@/pages/Reports"));
const ReportGenerator = lazy(() => import("@/pages/ReportGenerator"));
const Inventory       = lazy(() => import("@/pages/Inventory"));
const Referrals       = lazy(() => import("@/pages/Referrals"));
const Accounting      = lazy(() => import("@/pages/Accounting"));
const Banking         = lazy(() => import("@/pages/Banking"));
const Register        = lazy(() => import("@/pages/Register"));
const Settings        = lazy(() => import("@/pages/Settings"));
const SystemUpdate    = lazy(() => import("@/pages/SystemUpdate"));
const Dues            = lazy(() => import("@/pages/Dues"));
const DicomNodes      = lazy(() => import("@/pages/DicomNodes"));
const Discounts       = lazy(() => import("@/pages/Discounts"));
const PACS            = lazy(() => import("@/pages/PACS"));
const Appointments    = lazy(() => import("@/pages/Appointments"));
const Packages        = lazy(() => import("@/pages/Packages"));
const Expenses        = lazy(() => import("@/pages/Expenses"));
const DayClose        = lazy(() => import("@/pages/DayClose"));
const MyDayClose      = lazy(() => import("@/pages/MyDayClose"));
const BooksSanity     = lazy(() => import("@/pages/BooksSanity"));
const Staff           = lazy(() => import("@/pages/Staff"));
const HRForms         = lazy(() => import("@/pages/HRForms"));
const QueuePage       = lazy(() => import("@/pages/Queue"));
const Radiology       = lazy(() => import("@/pages/Radiology"));
const RadiologyWorklist = lazy(() => import("@/pages/RadiologyWorklist"));
const RadiologyReportEditor = lazy(() => import("@/pages/RadiologyReportEditor"));
const RadiologyReportGen = lazy(() => import("@/pages/RadiologyReportGenerator"));
const RadiologyReportingWorkspace = lazy(() => import("@/pages/RadiologyReportingWorkspace"));
const PacsDashboard         = lazy(() => import("@/pages/PacsDashboard"));
const MwlDashboard          = lazy(() => import("@/pages/MwlDashboard"));
const RadiologySettings     = lazy(() => import("@/pages/RadiologySettings"));
const DicomViewer           = lazy(() => import("@/pages/DicomViewer"));
const AgentSetup            = lazy(() => import("@/pages/AgentSetup"));
const PacsSettings          = lazy(() => import("@/pages/PacsSettings"));
const PacsLogs              = lazy(() => import("@/pages/PacsLogs"));
const DicomAgentDashboard   = lazy(() => import("@/pages/DicomAgentDashboard"));
const ModalityManagement    = lazy(() => import("@/pages/ModalityManagement"));
const DicomQueryRetrieve    = lazy(() => import("@/pages/DicomQueryRetrieve"));
const AiReportingSettings   = lazy(() => import("@/pages/AiReportingSettings"));
const PacsArchiveLifecycle  = lazy(() => import("@/pages/PacsArchiveLifecycle"));
const PacsWatchdogDashboard = lazy(() => import("@/pages/PacsWatchdogDashboard"));
const AiInferenceSettings   = lazy(() => import("@/pages/AiInferenceSettings"));
const Hl7Settings           = lazy(() => import("@/pages/Hl7Settings"));
const BackupReplication     = lazy(() => import("@/pages/BackupReplication"));
const UsgMeasurementReview  = lazy(() => import("@/pages/UsgMeasurementReview"));
const UsgAdminSettings      = lazy(() => import("@/pages/UsgAdminSettings"));
const UsgDoppler            = lazy(() => import("@/pages/UsgDoppler"));
const UsgWorklist           = lazy(() => import("@/pages/UsgWorklist"));
const UsgReporting          = lazy(() => import("@/pages/UsgReporting"));
const UsgDopplerReporting   = lazy(() => import("@/pages/UsgDopplerReporting"));
const UsgKeyImagesGallery   = lazy(() => import("@/pages/UsgKeyImagesGallery"));
const UsgCriticalAlerts     = lazy(() => import("@/pages/UsgCriticalAlerts"));
const ReportHub       = lazy(() => import("@/pages/ReportHub"));
const Machines        = lazy(() => import("@/pages/Machines"));
const FormF           = lazy(() => import("@/pages/FormF"));
const Website         = lazy(() => import("@/pages/Website"));
const WhatsAppChatbot = lazy(() => import("@/pages/WhatsAppChatbot"));
const Portal          = lazy(() => import("@/pages/Portal"));
const Display         = lazy(() => import("@/pages/Display"));
const OnlineBookings  = lazy(() => import("@/pages/OnlineBookings"));
const TeleradiologyPortal = lazy(() => import("@/pages/TeleradiologyPortal"));
const MobileViewer    = lazy(() => import("@/pages/MobileViewer"));
const DailySummary    = lazy(() => import("@/pages/DailySummary"));
const MyDailySummary  = lazy(() => import("@/pages/MyDailySummary"));
const OutsourcedLabs  = lazy(() => import("@/pages/OutsourcedLabs"));
const Samples         = lazy(() => import("@/pages/Samples"));
const Kiosk           = lazy(() => import("@/pages/Kiosk"));
const NotFound        = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    },
  },
});

const ERP_NAV_ORDER = [
  "/", "/dashboard", "/my-daily-summary", "/daily-summary", "/patients", "/appointments", "/queue", "/online-bookings",
  "/radiology", "/radiology/worklist", "/radiology/dicom-qr", "/radiology/report-generator", "/radiology/pacs-dashboard", "/radiology/pacs-settings", "/radiology/pacs-logs",
  "/radiology/dicom-agent-dashboard", "/radiology/modality-management",
  "/radiology/mwl-dashboard", "/radiology/agent-setup", "/radiology/ai-reporting-settings",
  "/radiology/viewer", "/radiology/archive-lifecycle", "/radiology/watchdog", "/radiology/ai-inference-settings", "/radiology/hl7-settings", "/teleradiology",
  "/radiology/usg-measurements", "/radiology/usg-admin-settings",
  "/usg", "/usg/worklist", "/usg/measurements", "/usg/reporting", "/usg/doppler", "/usg/key-images", "/usg/settings", "/usg/critical",
  "/settings/radiology", "/backup-replication",
  "/orders", "/tests", "/packages", "/billing", "/payments", "/reports",
  "/report-generator", "/report-hub", "/inventory", "/expenses", "/staff", "/referrals",
  "/accounting", "/discounts", "/form-f", "/machines", "/hr-forms", "/website", "/whatsapp-chatbot", "/settings",
  "/samples",
  "/pacs", "/dicom-nodes",
];

function PermissionGuard() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    const session = readStaffSession();
    if (!session) {
      navigate("/portal", { replace: true });
      return;
    }
    // Owner Dashboard is admin/super_admin only — redirect others to My Daily Summary.
    if (location === "/dashboard" && !FULL_ACCESS_ROLES.has(session.user.role)) {
      navigate("/my-daily-summary", { replace: true });
      return;
    }
    const matched = longestMatchingNavPath(location, ERP_NAV_ORDER);
    const pathToCheck = matched ?? location;
    if (!canAccess(session, pathToCheck)) {
      const target = firstPermissionedPath(session, ERP_NAV_ORDER) ?? firstAllowedPath(session, ERP_NAV_ORDER);
      navigate(target, { replace: true });
    }
  }, [location, navigate]);
  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/portal" component={Portal} />
        <Route path="/portal/:rest*" component={Portal} />
        <Route path="/teleradiology" component={TeleradiologyPortal} />
        <Route path="/teleradiology/:rest*" component={TeleradiologyPortal} />
        <Route path="/display" component={Display} />
        <Route path="/kiosk" component={Kiosk} />
        <Route>
          <PermissionGuard />
          <Layout>
            <Switch>
              <Route path="/" component={BillingDesk} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/patients" component={Patients} />
              <Route path="/patients/:id">
                {(params) => <PatientDetail id={Number(params.id)} />}
              </Route>
              <Route path="/tests" component={Tests} />
              <Route path="/orders" component={Orders} />
              <Route path="/orders/:id">
                {(params) => <OrderDetail id={Number(params.id)} />}
              </Route>
              <Route path="/billing" component={Billing} />
              <Route path="/billing/:id">
                {(params) => <BillDetail id={Number(params.id)} />}
              </Route>
              <Route path="/payments" component={Payments} />
              <Route path="/dues" component={Dues} />
              <Route path="/doctors" component={Doctors} />
              <Route path="/reports" component={Reports} />
              <Route path="/report-generator" component={ReportGenerator} />
              <Route path="/report-hub" component={ReportHub} />
              <Route path="/inventory" component={Inventory} />
              <Route path="/referrals" component={Referrals} />
              <Route path="/accounting" component={Accounting} />
              <Route path="/banking" component={Banking} />
              <Route path="/register" component={Register} />
              <Route path="/discounts" component={Discounts} />
              <Route path="/pacs" component={PACS} />
              <Route path="/dicom-nodes" component={DicomNodes} />
              <Route path="/appointments" component={Appointments} />
              <Route path="/daily-summary" component={DailySummary} />
              <Route path="/my-daily-summary" component={MyDailySummary} />
              <Route path="/online-bookings" component={OnlineBookings} />
              <Route path="/queue" component={QueuePage} />
              <Route path="/radiology" component={Radiology} />
              <Route path="/radiology/worklist" component={RadiologyWorklist} />
              <Route path="/radiology/report-generator">
                {() => <RadiologyReportGen />}
              </Route>
              <Route path="/radiology/report-generator/:studyId">
                {(params) => <RadiologyReportGen studyId={Number(params.studyId)} />}
              </Route>
              <Route path="/radiology/report/:studyId">
                {(params) => <RadiologyReportEditor studyId={Number(params.studyId)} />}
              </Route>
              <Route path="/radiology/reporting-workspace">
                {() => <RadiologyReportingWorkspace />}
              </Route>
              <Route path="/radiology/reporting-workspace/:studyId">
                {(params) => <RadiologyReportingWorkspace studyId={Number(params.studyId)} />}
              </Route>
              <Route path="/radiology/pacs-dashboard" component={PacsDashboard} />
              <Route path="/radiology/pacs-settings" component={PacsSettings} />
              <Route path="/radiology/pacs-logs" component={PacsLogs} />
              <Route path="/radiology/dicom-agent-dashboard" component={DicomAgentDashboard} />
              <Route path="/radiology/modality-management" component={ModalityManagement} />
              <Route path="/radiology/dicom-qr" component={DicomQueryRetrieve} />
              <Route path="/radiology/mwl-dashboard" component={MwlDashboard} />
              <Route path="/radiology/viewer/:studyInstanceUID" component={DicomViewer} />
              <Route path="/radiology/agent-setup" component={AgentSetup} />
              <Route path="/radiology/ai-reporting-settings" component={AiReportingSettings} />
              <Route path="/radiology/archive-lifecycle" component={PacsArchiveLifecycle} />
              <Route path="/radiology/watchdog" component={PacsWatchdogDashboard} />
              <Route path="/radiology/ai-inference-settings" component={AiInferenceSettings} />
              <Route path="/radiology/hl7-settings" component={Hl7Settings} />
              <Route path="/radiology/usg-measurements/:studyInstanceUID" component={UsgMeasurementReview} />
              <Route path="/radiology/usg-measurements" component={UsgMeasurementReview} />
              <Route path="/radiology/usg-admin-settings" component={UsgAdminSettings} />
              {/* USG / DOPPLER module */}
              <Route path="/usg" component={UsgDoppler} />
              <Route path="/usg/worklist" component={UsgWorklist} />
              <Route path="/usg/measurements/:uid" component={UsgMeasurementReview} />
              <Route path="/usg/measurements" component={UsgMeasurementReview} />
              <Route path="/usg/reporting" component={UsgReporting} />
              <Route path="/usg/doppler" component={UsgDopplerReporting} />
              <Route path="/usg/key-images" component={UsgKeyImagesGallery} />
              <Route path="/usg/critical" component={UsgCriticalAlerts} />
              <Route path="/usg/settings" component={UsgAdminSettings} />
              <Route path="/backup-replication" component={BackupReplication} />
              <Route path="/m/viewer/:studyInstanceUID" component={MobileViewer} />
              <Route path="/packages" component={Packages} />
              <Route path="/expenses" component={Expenses} />
              <Route path="/my-day-close" component={MyDayClose} />
              <Route path="/day-close" component={DayClose} />
              <Route path="/books-sanity" component={BooksSanity} />
              <Route path="/staff" component={Staff} />
              <Route path="/hr-forms" component={HRForms} />
              <Route path="/form-f" component={FormF} />
              <Route path="/machines" component={Machines} />
              <Route path="/website" component={Website} />
              <Route path="/outsourced-labs" component={OutsourcedLabs} />
              <Route path="/samples" component={Samples} />
              <Route path="/settings/radiology" component={RadiologySettings} />
              <Route path="/settings" component={Settings} />
              <Route path="/whatsapp-chatbot" component={WhatsAppChatbot} />
              <Route path="/system-update" component={SystemUpdate} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
