import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import BillingDesk from "@/pages/BillingDesk";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import PatientDetail from "@/pages/PatientDetail";
import Tests from "@/pages/Tests";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Billing from "@/pages/Billing";
import BillDetail from "@/pages/BillDetail";
import Payments from "@/pages/Payments";
import Doctors from "@/pages/Doctors";
import Reports from "@/pages/Reports";
import ReportGenerator from "@/pages/ReportGenerator";
import Inventory from "@/pages/Inventory";
import Referrals from "@/pages/Referrals";
import Accounting from "@/pages/Accounting";
import Register from "@/pages/Register";
import Settings from "@/pages/Settings";
import Dues from "@/pages/Dues";
import DicomNodes from "@/pages/DicomNodes";
import Discounts from "@/pages/Discounts";
import PACS from "@/pages/PACS";
import Appointments from "@/pages/Appointments";
import Packages from "@/pages/Packages";
import Expenses from "@/pages/Expenses";
import Staff from "@/pages/Staff";
import QueuePage from "@/pages/Queue";
import Radiology from "@/pages/Radiology";
import ReportHub from "@/pages/ReportHub";
import Machines from "@/pages/Machines";
import FormF from "@/pages/FormF";
import Website from "@/pages/Website";
import Portal from "@/pages/Portal";
import Display from "@/pages/Display";
import NotFound from "@/pages/not-found";
import { readStaffSession, canAccess, firstPermissionedPath, firstAllowedPath, longestMatchingNavPath } from "@/lib/staffSession";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60_000,       // 5 minutes globally
      refetchOnWindowFocus: false,  // never re-fetch just because user switched tabs
    },
  },
});

const ERP_NAV_ORDER = [
  "/", "/dashboard", "/patients", "/appointments", "/queue", "/radiology", "/orders",
  "/tests", "/packages", "/billing", "/payments", "/reports",
  "/report-generator", "/report-hub", "/inventory", "/expenses", "/staff", "/referrals",
  "/accounting", "/discounts", "/form-f", "/pacs", "/machines", "/settings",
];

// Soft route guard: if a portal staff session exists and the user navigates
// to a permissioned path they don't have rights to, bounce them to the first
// page they CAN see. No-op when there's no session (open ERP, backwards compat).
function PermissionGuard() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    const session = readStaffSession();
    if (!session) return;
    // Use the LONGEST matching prefix so e.g. "/orders/123/edit" maps to "/orders"
    // and "/" only matches the exact root.
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
    <Switch>
      <Route path="/portal" component={Portal} />
      <Route path="/portal/:rest*" component={Portal} />
      <Route path="/display" component={Display} />
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
            <Route path="/register" component={Register} />
            <Route path="/discounts" component={Discounts} />
            <Route path="/pacs" component={PACS} />
            <Route path="/dicom-nodes" component={DicomNodes} />
            <Route path="/appointments" component={Appointments} />
            <Route path="/queue" component={QueuePage} />
            <Route path="/radiology" component={Radiology} />
            <Route path="/packages" component={Packages} />
            <Route path="/expenses" component={Expenses} />
            <Route path="/staff" component={Staff} />
            <Route path="/form-f" component={FormF} />
            <Route path="/machines" component={Machines} />
            <Route path="/website" component={Website} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
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
