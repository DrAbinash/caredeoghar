import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
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
import Discounts from "@/pages/Discounts";
import PACS from "@/pages/PACS";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
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
        <Route path="/doctors" component={Doctors} />
        <Route path="/reports" component={Reports} />
        <Route path="/report-generator" component={ReportGenerator} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/referrals" component={Referrals} />
        <Route path="/accounting" component={Accounting} />
        <Route path="/register" component={Register} />
        <Route path="/discounts" component={Discounts} />
        <Route path="/pacs" component={PACS} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
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
