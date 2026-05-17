--
-- PostgreSQL database dump
--

\restrict Do4xChrvKG9eHFkrmXJkmc64WEbPcTydHso8ABAEYl4embBUuFhrduoedysKqOD

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abnormal_findings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.abnormal_findings (
    id integer NOT NULL,
    test_id integer,
    modality text,
    category text,
    keyword text NOT NULL,
    aliases text,
    description text NOT NULL,
    severity text DEFAULT 'moderate'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.abnormal_findings OWNER TO postgres;

--
-- Name: abnormal_findings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.abnormal_findings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.abnormal_findings_id_seq OWNER TO postgres;

--
-- Name: abnormal_findings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.abnormal_findings_id_seq OWNED BY public.abnormal_findings.id;


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    code text,
    bank_name text,
    account_number text,
    ifsc_code text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tally_group text,
    opening_balance numeric(14,2) DEFAULT '0'::numeric,
    opening_balance_type text DEFAULT 'Dr'::text,
    gst_applicable boolean DEFAULT false,
    gst_number text,
    pan text
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accounts_id_seq OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: ai_provider_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_provider_settings (
    id integer NOT NULL,
    provider text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    encrypted_api_key text,
    default_model text,
    settings_json text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_provider_settings OWNER TO postgres;

--
-- Name: ai_provider_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_provider_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_provider_settings_id_seq OWNER TO postgres;

--
-- Name: ai_provider_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_provider_settings_id_seq OWNED BY public.ai_provider_settings.id;


--
-- Name: ai_reporting_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_reporting_audit_logs (
    id integer NOT NULL,
    user_id integer,
    user_name text,
    patient_id integer,
    study_instance_uid text,
    accession_number text,
    provider text NOT NULL,
    model text,
    prompt_text text,
    num_images integer DEFAULT 0 NOT NULL,
    anonymized boolean DEFAULT true NOT NULL,
    included_demographics boolean DEFAULT false NOT NULL,
    was_inserted_to_report boolean DEFAULT false NOT NULL,
    draft_id integer,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_reporting_audit_logs OWNER TO postgres;

--
-- Name: ai_reporting_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_reporting_audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_reporting_audit_logs_id_seq OWNER TO postgres;

--
-- Name: ai_reporting_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_reporting_audit_logs_id_seq OWNED BY public.ai_reporting_audit_logs.id;


--
-- Name: ai_reporting_drafts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_reporting_drafts (
    id integer NOT NULL,
    study_instance_uid text,
    accession_number text,
    patient_id integer,
    user_id integer,
    user_name text,
    provider text NOT NULL,
    model text,
    prompt_text text,
    template_name text,
    ai_response text,
    draft_text text,
    status text DEFAULT 'draft'::text NOT NULL,
    inserted_at timestamp with time zone,
    inserted_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_reporting_drafts OWNER TO postgres;

--
-- Name: ai_reporting_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ai_reporting_drafts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_reporting_drafts_id_seq OWNER TO postgres;

--
-- Name: ai_reporting_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ai_reporting_drafts_id_seq OWNED BY public.ai_reporting_drafts.id;


--
-- Name: appointment_counter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appointment_counter (
    id integer NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.appointment_counter OWNER TO postgres;

--
-- Name: appointment_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.appointment_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.appointment_counter_id_seq OWNER TO postgres;

--
-- Name: appointment_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.appointment_counter_id_seq OWNED BY public.appointment_counter.id;


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.appointments (
    id integer NOT NULL,
    appointment_id text NOT NULL,
    patient_id integer NOT NULL,
    doctor_id integer,
    package_id integer,
    appointment_date text NOT NULL,
    time_slot text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    type text DEFAULT 'walk-in'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ledger_id integer
);


ALTER TABLE public.appointments OWNER TO postgres;

--
-- Name: appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.appointments_id_seq OWNER TO postgres;

--
-- Name: appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.appointments_id_seq OWNED BY public.appointments.id;


--
-- Name: audit_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_runs (
    id integer NOT NULL,
    period_from text NOT NULL,
    period_to text NOT NULL,
    generated_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    completed_by text,
    source text DEFAULT 'manual'::text NOT NULL,
    notes text,
    anomaly_count integer DEFAULT 0 NOT NULL,
    high_count integer DEFAULT 0 NOT NULL,
    total_impact numeric(14,2) DEFAULT 0 NOT NULL,
    snapshot jsonb NOT NULL,
    email_sent_at timestamp without time zone
);


ALTER TABLE public.audit_runs OWNER TO postgres;

--
-- Name: audit_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_runs_id_seq OWNER TO postgres;

--
-- Name: audit_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_runs_id_seq OWNED BY public.audit_runs.id;


--
-- Name: backup_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.backup_logs (
    id integer NOT NULL,
    backup_type text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    format text DEFAULT 'json'::text NOT NULL,
    row_count integer,
    size_bytes bigint,
    error_message text,
    performed_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.backup_logs OWNER TO postgres;

--
-- Name: backup_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.backup_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.backup_logs_id_seq OWNER TO postgres;

--
-- Name: backup_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.backup_logs_id_seq OWNED BY public.backup_logs.id;


--
-- Name: bill_audits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bill_audits (
    id integer NOT NULL,
    bill_id integer NOT NULL,
    edited_by text NOT NULL,
    reason text NOT NULL,
    change_type text NOT NULL,
    old_value text,
    new_value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bill_audits OWNER TO postgres;

--
-- Name: bill_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bill_audits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bill_audits_id_seq OWNER TO postgres;

--
-- Name: bill_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bill_audits_id_seq OWNED BY public.bill_audits.id;


--
-- Name: bills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bills (
    id integer NOT NULL,
    bill_number text NOT NULL,
    order_id integer NOT NULL,
    patient_id integer NOT NULL,
    subtotal numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    discount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    paid_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    balance_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    due_date text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discount_reason text,
    discount_reason_note text,
    created_by_name text,
    cancelled_at timestamp with time zone,
    cancelled_by_name text,
    cancellation_reason text,
    refund_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    ledger_id integer
);


ALTER TABLE public.bills OWNER TO postgres;

--
-- Name: bills_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bills_id_seq OWNER TO postgres;

--
-- Name: bills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bills_id_seq OWNED BY public.bills.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    city text,
    state text,
    pincode text,
    phone text,
    email text,
    gstin text,
    manager text,
    is_main boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.branches OWNER TO postgres;

--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.branches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.branches_id_seq OWNER TO postgres;

--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: bridge_fingerprint_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bridge_fingerprint_templates (
    id integer NOT NULL,
    scope text NOT NULL,
    scope_id integer NOT NULL,
    vendor text DEFAULT 'generic'::text NOT NULL,
    finger_name text,
    template text NOT NULL,
    quality integer,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


ALTER TABLE public.bridge_fingerprint_templates OWNER TO postgres;

--
-- Name: bridge_fingerprint_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bridge_fingerprint_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bridge_fingerprint_templates_id_seq OWNER TO postgres;

--
-- Name: bridge_fingerprint_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bridge_fingerprint_templates_id_seq OWNED BY public.bridge_fingerprint_templates.id;


--
-- Name: clinic_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clinic_settings (
    id integer NOT NULL,
    name text DEFAULT 'DiagnoCenter'::text NOT NULL,
    tagline text DEFAULT 'Diagnostic & Pathology Services'::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    website text DEFAULT ''::text NOT NULL,
    gstin text DEFAULT ''::text NOT NULL,
    logo_data_url text,
    footer_note text DEFAULT 'Thank you for choosing our diagnostic services.'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    form_f_test_ids text DEFAULT '[]'::text NOT NULL,
    quick_test_ids text DEFAULT '[null,null,null,null,null,null]'::text NOT NULL,
    patient_photo_enabled boolean DEFAULT false NOT NULL,
    portal_enabled boolean DEFAULT false NOT NULL,
    portal_heading text DEFAULT ''::text NOT NULL,
    portal_welcome_message text DEFAULT ''::text NOT NULL,
    portal_allow_appointment_booking boolean DEFAULT true NOT NULL,
    portal_allow_profile_edit boolean DEFAULT true NOT NULL,
    show_tat_on_bill boolean DEFAULT false NOT NULL,
    bill_print_copies integer DEFAULT 1 NOT NULL,
    qr_on_bill_enabled boolean DEFAULT true NOT NULL,
    online_booking_enabled boolean DEFAULT false NOT NULL,
    razorpay_key_id text DEFAULT ''::text NOT NULL,
    online_booking_ledger_id integer DEFAULT 1 NOT NULL,
    vip_queue_enabled boolean DEFAULT false NOT NULL,
    kiosk_enabled boolean DEFAULT false NOT NULL,
    kiosk_upi_vpa text DEFAULT ''::text NOT NULL,
    kiosk_upi_name text DEFAULT ''::text NOT NULL,
    kiosk_welcome_message text DEFAULT ''::text NOT NULL,
    kiosk_allowed_test_ids text DEFAULT '[]'::text NOT NULL,
    sidebar_theme text DEFAULT 'navy'::text NOT NULL,
    bill_default_paper_size text DEFAULT 'A5'::text NOT NULL,
    bill_show_code boolean DEFAULT true NOT NULL,
    bill_show_category boolean DEFAULT true NOT NULL,
    payu_enabled boolean DEFAULT false NOT NULL,
    payu_merchant_key text DEFAULT ''::text NOT NULL,
    day_close_auto_print boolean DEFAULT true NOT NULL,
    commission_discount_mode text DEFAULT 'none'::text NOT NULL,
    lan_only_login boolean DEFAULT false NOT NULL,
    lan_allowed_ips text DEFAULT '[]'::text NOT NULL
);


ALTER TABLE public.clinic_settings OWNER TO postgres;

--
-- Name: clinic_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clinic_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clinic_settings_id_seq OWNER TO postgres;

--
-- Name: clinic_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clinic_settings_id_seq OWNED BY public.clinic_settings.id;


--
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.commission_rules (
    id integer NOT NULL,
    doctor_id integer NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'percentage'::text NOT NULL,
    value numeric(10,2) NOT NULL,
    scope text DEFAULT 'all'::text NOT NULL,
    categories text,
    test_ids text,
    is_exclusive boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.commission_rules OWNER TO postgres;

--
-- Name: commission_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.commission_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.commission_rules_id_seq OWNER TO postgres;

--
-- Name: commission_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.commission_rules_id_seq OWNED BY public.commission_rules.id;


--
-- Name: day_closures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.day_closures (
    id integer NOT NULL,
    closure_date date NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_by_user_id integer,
    closed_by_name text DEFAULT ''::text NOT NULL,
    covered_from_ts timestamp with time zone,
    covered_to_ts timestamp with time zone DEFAULT now() NOT NULL,
    expected_cash numeric(12,2) DEFAULT 0 NOT NULL,
    expected_upi numeric(12,2) DEFAULT 0 NOT NULL,
    expected_card numeric(12,2) DEFAULT 0 NOT NULL,
    expected_cheque numeric(12,2) DEFAULT 0 NOT NULL,
    expected_other numeric(12,2) DEFAULT 0 NOT NULL,
    actual_cash numeric(12,2) DEFAULT 0 NOT NULL,
    actual_upi numeric(12,2) DEFAULT 0 NOT NULL,
    actual_card numeric(12,2) DEFAULT 0 NOT NULL,
    actual_cheque numeric(12,2) DEFAULT 0 NOT NULL,
    actual_other numeric(12,2) DEFAULT 0 NOT NULL,
    variance numeric(12,2) DEFAULT 0 NOT NULL,
    variance_note text DEFAULT ''::text NOT NULL,
    bills_count integer DEFAULT 0 NOT NULL,
    payments_count integer DEFAULT 0 NOT NULL,
    total_expected numeric(12,2) DEFAULT 0 NOT NULL,
    total_actual numeric(12,2) DEFAULT 0 NOT NULL,
    staff_breakdown jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'closed'::text NOT NULL,
    reopened_at timestamp with time zone,
    reopened_by_user_id integer,
    reopened_by_name text DEFAULT ''::text NOT NULL,
    reopen_reason text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.day_closures OWNER TO postgres;

--
-- Name: day_closures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.day_closures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.day_closures_id_seq OWNER TO postgres;

--
-- Name: day_closures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.day_closures_id_seq OWNED BY public.day_closures.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    head_of_department text,
    contact_phone text,
    contact_email text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.departments_id_seq OWNER TO postgres;

--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: diagnostic_tests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.diagnostic_tests (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    price numeric(10,2) NOT NULL,
    duration text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    department text DEFAULT 'Pathology'::text NOT NULL,
    room_number text DEFAULT ''::text NOT NULL,
    test_type text DEFAULT 'inhouse'::text NOT NULL,
    outsourced_lab_id integer,
    room_id integer,
    modality_id integer,
    floor_label text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.diagnostic_tests OWNER TO postgres;

--
-- Name: diagnostic_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.diagnostic_tests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.diagnostic_tests_id_seq OWNER TO postgres;

--
-- Name: diagnostic_tests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.diagnostic_tests_id_seq OWNED BY public.diagnostic_tests.id;


--
-- Name: dicom_failed_retrieval_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_failed_retrieval_queue (
    id integer NOT NULL,
    study_instance_uid text NOT NULL,
    accession_number text,
    modality text,
    source_ae_title text,
    source_ip text,
    failure_type text,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 5 NOT NULL,
    next_retry_at timestamp with time zone,
    status text DEFAULT 'PENDING'::text NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dicom_failed_retrieval_queue OWNER TO postgres;

--
-- Name: dicom_failed_retrieval_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_failed_retrieval_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_failed_retrieval_queue_id_seq OWNER TO postgres;

--
-- Name: dicom_failed_retrieval_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_failed_retrieval_queue_id_seq OWNED BY public.dicom_failed_retrieval_queue.id;


--
-- Name: dicom_modalities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_modalities (
    id integer NOT NULL,
    machine_name text NOT NULL,
    modality text,
    ae_title text,
    ip_address text,
    port integer,
    location text,
    auto_send_enabled boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_connection_status text,
    last_seen_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manufacturer text,
    query_enabled boolean DEFAULT true NOT NULL,
    retrieve_enabled boolean DEFAULT true NOT NULL,
    polling_enabled boolean DEFAULT false NOT NULL,
    polling_interval_seconds integer DEFAULT 300 NOT NULL,
    retrieve_method text DEFAULT 'C_MOVE'::text NOT NULL,
    preferred_transfer_syntax text,
    destination_pacs text DEFAULT 'CONQUEST'::text NOT NULL,
    auto_push_to_conquest boolean DEFAULT true NOT NULL,
    auto_create_worklist boolean DEFAULT true NOT NULL,
    auto_notify_radiologist boolean DEFAULT false NOT NULL,
    notes text
);


ALTER TABLE public.dicom_modalities OWNER TO postgres;

--
-- Name: dicom_modalities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_modalities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_modalities_id_seq OWNER TO postgres;

--
-- Name: dicom_modalities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_modalities_id_seq OWNED BY public.dicom_modalities.id;


--
-- Name: dicom_nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_nodes (
    id integer NOT NULL,
    ae_title text NOT NULL,
    host text NOT NULL,
    port integer DEFAULT 104 NOT NULL,
    modality text DEFAULT 'OT'::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_test_at timestamp with time zone,
    last_test_status text,
    last_test_message text,
    last_test_latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_pull boolean DEFAULT false NOT NULL,
    pull_interval_minutes integer DEFAULT 15 NOT NULL,
    pull_query_days integer DEFAULT 1 NOT NULL,
    conquest_ae_title text DEFAULT ''::text NOT NULL,
    conquest_host text DEFAULT ''::text NOT NULL,
    conquest_port integer DEFAULT 5678 NOT NULL,
    last_pull_at timestamp with time zone,
    last_pull_status text,
    last_pull_message text
);


ALTER TABLE public.dicom_nodes OWNER TO postgres;

--
-- Name: dicom_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_nodes_id_seq OWNER TO postgres;

--
-- Name: dicom_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_nodes_id_seq OWNED BY public.dicom_nodes.id;


--
-- Name: dicom_pull_agent_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_pull_agent_logs (
    id integer NOT NULL,
    agent_name text,
    agent_host text,
    event_type text NOT NULL,
    source_ae_title text,
    source_ip text,
    modality text,
    study_instance_uid text,
    accession_number text,
    patient_name text,
    patient_id text,
    status text DEFAULT 'INFO'::text NOT NULL,
    message text NOT NULL,
    raw_payload text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dicom_pull_agent_logs OWNER TO postgres;

--
-- Name: dicom_pull_agent_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_pull_agent_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_pull_agent_logs_id_seq OWNER TO postgres;

--
-- Name: dicom_pull_agent_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_pull_agent_logs_id_seq OWNED BY public.dicom_pull_agent_logs.id;


--
-- Name: dicom_pull_agent_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_pull_agent_status (
    id integer NOT NULL,
    agent_name text NOT NULL,
    agent_host text NOT NULL,
    last_heartbeat_at timestamp with time zone,
    last_successful_pull_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_message text,
    is_online boolean DEFAULT false NOT NULL,
    studies_found_today integer DEFAULT 0 NOT NULL,
    studies_pulled_today integer DEFAULT 0 NOT NULL,
    failed_today integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dicom_pull_agent_status OWNER TO postgres;

--
-- Name: dicom_pull_agent_status_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_pull_agent_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_pull_agent_status_id_seq OWNER TO postgres;

--
-- Name: dicom_pull_agent_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_pull_agent_status_id_seq OWNED BY public.dicom_pull_agent_status.id;


--
-- Name: dicom_pull_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_pull_jobs (
    id integer NOT NULL,
    node_id integer NOT NULL,
    trigger_type text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    query_date_from text NOT NULL,
    query_date_to text NOT NULL,
    studies_found integer,
    studies_pulled integer,
    studies_failed integer,
    study_instance_uids text,
    error_message text,
    agent_id text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dicom_pull_jobs OWNER TO postgres;

--
-- Name: dicom_pull_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_pull_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_pull_jobs_id_seq OWNER TO postgres;

--
-- Name: dicom_pull_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_pull_jobs_id_seq OWNED BY public.dicom_pull_jobs.id;


--
-- Name: dicom_pulled_studies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_pulled_studies (
    id integer NOT NULL,
    study_instance_uid text NOT NULL,
    accession_number text,
    modality text,
    source_ae_title text,
    source_ip text,
    patient_name text,
    patient_id text,
    study_date text,
    study_time text,
    status text DEFAULT 'NEW'::text NOT NULL,
    hash_signature text,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    pulled_at timestamp with time zone,
    pushed_to_pacs_at timestamp with time zone,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dicom_pulled_studies OWNER TO postgres;

--
-- Name: dicom_pulled_studies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_pulled_studies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_pulled_studies_id_seq OWNER TO postgres;

--
-- Name: dicom_pulled_studies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_pulled_studies_id_seq OWNED BY public.dicom_pulled_studies.id;


--
-- Name: dicom_routing_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dicom_routing_rules (
    id integer NOT NULL,
    name text NOT NULL,
    modality_type text,
    source_ae_title text,
    destination_pacs text DEFAULT 'CONQUEST'::text NOT NULL,
    destination_ae_title text,
    destination_ip text,
    destination_port integer,
    storage_path text,
    auto_push boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 10 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dicom_routing_rules OWNER TO postgres;

--
-- Name: dicom_routing_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.dicom_routing_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dicom_routing_rules_id_seq OWNER TO postgres;

--
-- Name: dicom_routing_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.dicom_routing_rules_id_seq OWNED BY public.dicom_routing_rules.id;


--
-- Name: discount_reasons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.discount_reasons (
    id integer NOT NULL,
    label text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.discount_reasons OWNER TO postgres;

--
-- Name: discount_reasons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.discount_reasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.discount_reasons_id_seq OWNER TO postgres;

--
-- Name: discount_reasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.discount_reasons_id_seq OWNED BY public.discount_reasons.id;


--
-- Name: discount_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.discount_rules (
    id integer NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'percentage'::text NOT NULL,
    value numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    scope text DEFAULT 'all'::text NOT NULL,
    categories text DEFAULT '[]'::text NOT NULL,
    test_ids text DEFAULT '[]'::text NOT NULL,
    expires_at text,
    reason text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    conditions text DEFAULT '[]'::text NOT NULL
);


ALTER TABLE public.discount_rules OWNER TO postgres;

--
-- Name: discount_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.discount_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.discount_rules_id_seq OWNER TO postgres;

--
-- Name: discount_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.discount_rules_id_seq OWNED BY public.discount_rules.id;


--
-- Name: doctor_payouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doctor_payouts (
    id integer NOT NULL,
    doctor_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date text NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    reference text,
    period_from text,
    period_to text,
    notes text,
    voucher_id integer,
    performed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.doctor_payouts OWNER TO postgres;

--
-- Name: doctor_payouts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.doctor_payouts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.doctor_payouts_id_seq OWNER TO postgres;

--
-- Name: doctor_payouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.doctor_payouts_id_seq OWNED BY public.doctor_payouts.id;


--
-- Name: doctors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doctors (
    id integer NOT NULL,
    name text NOT NULL,
    specialization text NOT NULL,
    phone text,
    hospital_affiliation text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    default_commission_type text DEFAULT 'percentage'::text NOT NULL,
    default_commission numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    ledger_id integer,
    registration_number text
);


ALTER TABLE public.doctors OWNER TO postgres;

--
-- Name: doctors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.doctors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.doctors_id_seq OWNER TO postgres;

--
-- Name: doctors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.doctors_id_seq OWNED BY public.doctors.id;


--
-- Name: drawer_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drawer_audit_log (
    id integer NOT NULL,
    user_closure_id integer,
    action text NOT NULL,
    user_id integer,
    user_name text NOT NULL,
    user_role text DEFAULT 'staff'::text NOT NULL,
    expected_total numeric(12,2),
    actual_total numeric(12,2),
    variance numeric(12,2),
    reason text DEFAULT ''::text NOT NULL,
    target_type text,
    target_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.drawer_audit_log OWNER TO postgres;

--
-- Name: drawer_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.drawer_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.drawer_audit_log_id_seq OWNER TO postgres;

--
-- Name: drawer_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.drawer_audit_log_id_seq OWNED BY public.drawer_audit_log.id;


--
-- Name: email_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_settings (
    id integer NOT NULL,
    smtp_host text DEFAULT ''::text NOT NULL,
    smtp_port text DEFAULT '587'::text NOT NULL,
    smtp_user text DEFAULT ''::text NOT NULL,
    smtp_password text DEFAULT ''::text NOT NULL,
    smtp_secure boolean DEFAULT false NOT NULL,
    from_address text DEFAULT ''::text NOT NULL,
    from_name text DEFAULT 'DiagnoCenter ERP'::text NOT NULL,
    admin_email text DEFAULT ''::text NOT NULL,
    extra_recipients text DEFAULT '[]'::text NOT NULL,
    bill_edit_enabled boolean DEFAULT true NOT NULL,
    daily_summary_enabled boolean DEFAULT true NOT NULL,
    daily_summary_time text DEFAULT '17:00'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_settings OWNER TO postgres;

--
-- Name: email_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.email_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.email_settings_id_seq OWNER TO postgres;

--
-- Name: email_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.email_settings_id_seq OWNED BY public.email_settings.id;


--
-- Name: expense_counter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expense_counter (
    id integer NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.expense_counter OWNER TO postgres;

--
-- Name: expense_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.expense_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.expense_counter_id_seq OWNER TO postgres;

--
-- Name: expense_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.expense_counter_id_seq OWNED BY public.expense_counter.id;


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expenses (
    id integer NOT NULL,
    expense_id text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    amount numeric(10,2) NOT NULL,
    expense_date text NOT NULL,
    payment_mode text DEFAULT 'cash'::text NOT NULL,
    paid_to text,
    voucher_id integer,
    approved_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.expenses OWNER TO postgres;

--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.expenses_id_seq OWNER TO postgres;

--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- Name: floors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.floors (
    id integer NOT NULL,
    name text NOT NULL,
    code text DEFAULT ''::text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.floors OWNER TO postgres;

--
-- Name: floors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.floors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.floors_id_seq OWNER TO postgres;

--
-- Name: floors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.floors_id_seq OWNED BY public.floors.id;


--
-- Name: form_f_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.form_f_records (
    id integer NOT NULL,
    bill_id integer,
    patient_id integer,
    bill_number text,
    centre_name text DEFAULT ''::text NOT NULL,
    registration_no text DEFAULT ''::text NOT NULL,
    patient_name text DEFAULT ''::text NOT NULL,
    age text DEFAULT ''::text NOT NULL,
    children_details text DEFAULT ''::text NOT NULL,
    husband_father_name text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    mobile text DEFAULT ''::text NOT NULL,
    referred_by text DEFAULT 'Self'::text NOT NULL,
    lmp_weeks text DEFAULT ''::text NOT NULL,
    genetic_history text DEFAULT ''::text NOT NULL,
    basis_diagnosis text DEFAULT ''::text NOT NULL,
    previous_child_issue text DEFAULT ''::text NOT NULL,
    indication_other text DEFAULT ''::text NOT NULL,
    doctor_name text DEFAULT ''::text NOT NULL,
    procedure text DEFAULT ''::text NOT NULL,
    procedure_purpose text DEFAULT ''::text NOT NULL,
    invasive_procedure text DEFAULT ''::text NOT NULL,
    complication text DEFAULT ''::text NOT NULL,
    lab_tests text DEFAULT ''::text NOT NULL,
    prenatal_result text DEFAULT ''::text NOT NULL,
    ultrasound_result text DEFAULT ''::text NOT NULL,
    abnormality text DEFAULT ''::text NOT NULL,
    procedure_date text DEFAULT ''::text NOT NULL,
    consent_date text DEFAULT ''::text NOT NULL,
    result_conveyed text DEFAULT ''::text NOT NULL,
    mtp_advised text DEFAULT ''::text NOT NULL,
    mtp_date text DEFAULT ''::text NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    place text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.form_f_records OWNER TO postgres;

--
-- Name: form_f_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.form_f_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.form_f_records_id_seq OWNER TO postgres;

--
-- Name: form_f_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.form_f_records_id_seq OWNED BY public.form_f_records.id;


--
-- Name: hr_rejoining_form_counter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hr_rejoining_form_counter (
    id integer NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.hr_rejoining_form_counter OWNER TO postgres;

--
-- Name: hr_rejoining_form_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hr_rejoining_form_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.hr_rejoining_form_counter_id_seq OWNER TO postgres;

--
-- Name: hr_rejoining_form_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hr_rejoining_form_counter_id_seq OWNED BY public.hr_rejoining_form_counter.id;


--
-- Name: hr_rejoining_forms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hr_rejoining_forms (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    form_number text NOT NULL,
    photo_data_url text,
    employee_name text NOT NULL,
    father_spouse_name text,
    date_of_birth date,
    gender text,
    blood_group text,
    qualification text,
    aadhaar_number text,
    pan_number text,
    address text,
    mobile text,
    alternate_mobile text,
    email text,
    designation text,
    department text,
    joining_date date,
    rejoining_date date,
    family_details jsonb,
    emergency_contact_name text,
    emergency_contact_relation text,
    emergency_contact_phone text,
    bank_account_holder text,
    bank_name text,
    bank_account_number text,
    bank_ifsc text,
    bank_branch text,
    salary_structure jsonb,
    fixed_salary numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    incentive_acknowledged boolean DEFAULT false NOT NULL,
    deduction_acknowledged boolean DEFAULT false NOT NULL,
    shift_type text,
    reporting_time text,
    duty_hours text,
    confidentiality_acknowledged boolean DEFAULT false NOT NULL,
    notice_period_days integer DEFAULT 30 NOT NULL,
    notice_policy_acknowledged boolean DEFAULT false NOT NULL,
    document_checklist jsonb,
    employee_declaration_date date,
    employee_signature_data_url text,
    remarks text,
    management_status text DEFAULT 'pending'::text NOT NULL,
    approved_by_user_id integer,
    approved_by_name text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_storage_key text
);


ALTER TABLE public.hr_rejoining_forms OWNER TO postgres;

--
-- Name: hr_rejoining_forms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hr_rejoining_forms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.hr_rejoining_forms_id_seq OWNER TO postgres;

--
-- Name: hr_rejoining_forms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hr_rejoining_forms_id_seq OWNED BY public.hr_rejoining_forms.id;


--
-- Name: inventory_consumption_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_consumption_rules (
    id integer NOT NULL,
    test_id integer NOT NULL,
    item_id integer NOT NULL,
    quantity numeric(10,2) DEFAULT '1'::numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.inventory_consumption_rules OWNER TO postgres;

--
-- Name: inventory_consumption_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_consumption_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_consumption_rules_id_seq OWNER TO postgres;

--
-- Name: inventory_consumption_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_consumption_rules_id_seq OWNED BY public.inventory_consumption_rules.id;


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    category text DEFAULT 'consumable'::text NOT NULL,
    current_stock numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    min_stock numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    cost_price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    preferred_vendor_id integer
);


ALTER TABLE public.inventory_items OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_items_id_seq OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_items_id_seq OWNED BY public.inventory_items.id;


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_transactions (
    id integer NOT NULL,
    item_id integer NOT NULL,
    type text NOT NULL,
    quantity numeric(10,2) NOT NULL,
    stock_before numeric(10,2) NOT NULL,
    stock_after numeric(10,2) NOT NULL,
    reason text,
    reference text,
    performed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vendor_id integer,
    invoice_number text,
    invoice_date date,
    unit_cost numeric(12,2)
);


ALTER TABLE public.inventory_transactions OWNER TO postgres;

--
-- Name: inventory_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_transactions_id_seq OWNER TO postgres;

--
-- Name: inventory_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_transactions_id_seq OWNED BY public.inventory_transactions.id;


--
-- Name: kiosk_payment_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kiosk_payment_sessions (
    id integer NOT NULL,
    payment_link_id text NOT NULL,
    session_ref text NOT NULL,
    test_ids text NOT NULL,
    amount_paise integer NOT NULL,
    patient_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    razorpay_payment_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL
);


ALTER TABLE public.kiosk_payment_sessions OWNER TO postgres;

--
-- Name: kiosk_payment_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.kiosk_payment_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.kiosk_payment_sessions_id_seq OWNER TO postgres;

--
-- Name: kiosk_payment_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.kiosk_payment_sessions_id_seq OWNED BY public.kiosk_payment_sessions.id;


--
-- Name: ledgers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ledgers (
    id integer NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_walk_in boolean DEFAULT false NOT NULL
);


ALTER TABLE public.ledgers OWNER TO postgres;

--
-- Name: ledgers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ledgers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ledgers_id_seq OWNER TO postgres;

--
-- Name: ledgers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ledgers_id_seq OWNED BY public.ledgers.id;


--
-- Name: machine_amc_contracts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine_amc_contracts (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    contract_type text DEFAULT 'AMC'::text NOT NULL,
    vendor text NOT NULL,
    contract_number text,
    start_date text NOT NULL,
    end_date text NOT NULL,
    cost numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    contact_person text,
    contact_phone text,
    contact_email text,
    coverage text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.machine_amc_contracts OWNER TO postgres;

--
-- Name: machine_amc_contracts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.machine_amc_contracts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.machine_amc_contracts_id_seq OWNER TO postgres;

--
-- Name: machine_amc_contracts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.machine_amc_contracts_id_seq OWNED BY public.machine_amc_contracts.id;


--
-- Name: machine_breakdowns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine_breakdowns (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    reported_at timestamp with time zone DEFAULT now() NOT NULL,
    reported_by text,
    description text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    resolved_at timestamp with time zone,
    resolution text,
    downtime_hours numeric(8,2),
    repair_cost numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    service_vendor text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.machine_breakdowns OWNER TO postgres;

--
-- Name: machine_breakdowns_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.machine_breakdowns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.machine_breakdowns_id_seq OWNER TO postgres;

--
-- Name: machine_breakdowns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.machine_breakdowns_id_seq OWNED BY public.machine_breakdowns.id;


--
-- Name: machine_service_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine_service_records (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    service_date text NOT NULL,
    service_type text DEFAULT 'preventive'::text NOT NULL,
    engineer text,
    vendor text,
    cost numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    parts_replaced text,
    notes text,
    next_due_date text,
    certificate_number text,
    certificate_url text,
    performed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.machine_service_records OWNER TO postgres;

--
-- Name: machine_service_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.machine_service_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.machine_service_records_id_seq OWNER TO postgres;

--
-- Name: machine_service_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.machine_service_records_id_seq OWNED BY public.machine_service_records.id;


--
-- Name: machines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machines (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    model_number text,
    serial_number text,
    manufacturer text,
    department text DEFAULT ''::text NOT NULL,
    location text,
    purchase_date text,
    purchase_cost numeric(14,2),
    warranty_end text,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.machines OWNER TO postgres;

--
-- Name: machines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.machines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.machines_id_seq OWNER TO postgres;

--
-- Name: machines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.machines_id_seq OWNED BY public.machines.id;


--
-- Name: modalities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.modalities (
    id integer NOT NULL,
    name text NOT NULL,
    code text DEFAULT ''::text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.modalities OWNER TO postgres;

--
-- Name: modalities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.modalities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.modalities_id_seq OWNER TO postgres;

--
-- Name: modalities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.modalities_id_seq OWNED BY public.modalities.id;


--
-- Name: online_bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.online_bookings (
    id integer NOT NULL,
    booking_ref text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    selected_date text NOT NULL,
    test_ids text DEFAULT '[]'::text NOT NULL,
    package_ids text DEFAULT '[]'::text NOT NULL,
    total_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    is_vip boolean DEFAULT false NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    razorpay_signature text,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    patient_id integer,
    bill_id integer,
    confirmed_by_name text,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payu_txn_id text,
    payu_payment_id text,
    time_slot text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.online_bookings OWNER TO postgres;

--
-- Name: online_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.online_bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.online_bookings_id_seq OWNER TO postgres;

--
-- Name: online_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.online_bookings_id_seq OWNED BY public.online_bookings.id;


--
-- Name: order_tests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_tests (
    id integer NOT NULL,
    order_id integer NOT NULL,
    test_id integer NOT NULL,
    price numeric(10,2) NOT NULL,
    result text,
    result_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    cancelled_by_name text,
    cancelled_at timestamp with time zone,
    cancellation_reason text
);


ALTER TABLE public.order_tests OWNER TO postgres;

--
-- Name: order_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_tests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_tests_id_seq OWNER TO postgres;

--
-- Name: order_tests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_tests_id_seq OWNED BY public.order_tests.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_number text NOT NULL,
    patient_id integer NOT NULL,
    doctor_id integer,
    status text DEFAULT 'pending'::text NOT NULL,
    total_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    collected_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ledger_id integer
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: outsourced_labs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.outsourced_labs (
    id integer NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    address text,
    gstin text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.outsourced_labs OWNER TO postgres;

--
-- Name: outsourced_labs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.outsourced_labs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outsourced_labs_id_seq OWNER TO postgres;

--
-- Name: outsourced_labs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.outsourced_labs_id_seq OWNED BY public.outsourced_labs.id;


--
-- Name: package_counter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.package_counter (
    id integer NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.package_counter OWNER TO postgres;

--
-- Name: package_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.package_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.package_counter_id_seq OWNER TO postgres;

--
-- Name: package_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.package_counter_id_seq OWNED BY public.package_counter.id;


--
-- Name: package_tests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.package_tests (
    id integer NOT NULL,
    package_id integer NOT NULL,
    test_id integer NOT NULL,
    discount_pct numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL
);


ALTER TABLE public.package_tests OWNER TO postgres;

--
-- Name: package_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.package_tests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.package_tests_id_seq OWNER TO postgres;

--
-- Name: package_tests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.package_tests_id_seq OWNED BY public.package_tests.id;


--
-- Name: packages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.packages (
    id integer NOT NULL,
    package_code text NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    discount_pct numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discount_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL
);


ALTER TABLE public.packages OWNER TO postgres;

--
-- Name: packages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.packages_id_seq OWNER TO postgres;

--
-- Name: packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.packages_id_seq OWNED BY public.packages.id;


--
-- Name: pacs_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pacs_logs (
    id integer NOT NULL,
    log_type text,
    severity text DEFAULT 'info'::text NOT NULL,
    source text,
    event_type text,
    message text NOT NULL,
    study_instance_uid text,
    accession_number text,
    patient_id text,
    modality text,
    payload text,
    error_stack text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pacs_logs OWNER TO postgres;

--
-- Name: pacs_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pacs_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pacs_logs_id_seq OWNER TO postgres;

--
-- Name: pacs_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pacs_logs_id_seq OWNED BY public.pacs_logs.id;


--
-- Name: pacs_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pacs_settings (
    id integer NOT NULL,
    key text NOT NULL,
    value text,
    category text DEFAULT 'general'::text NOT NULL,
    is_secret boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pacs_settings OWNER TO postgres;

--
-- Name: pacs_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pacs_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pacs_settings_id_seq OWNER TO postgres;

--
-- Name: pacs_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pacs_settings_id_seq OWNED BY public.pacs_settings.id;


--
-- Name: patient_counter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patient_counter (
    id integer NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.patient_counter OWNER TO postgres;

--
-- Name: patient_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.patient_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patient_counter_id_seq OWNER TO postgres;

--
-- Name: patient_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.patient_counter_id_seq OWNED BY public.patient_counter.id;


--
-- Name: patient_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patient_reports (
    id integer NOT NULL,
    report_number text NOT NULL,
    type text DEFAULT 'pathology'::text NOT NULL,
    patient_id integer NOT NULL,
    test_id integer NOT NULL,
    order_test_id integer,
    order_id integer,
    bill_id integer,
    study_id integer,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    parameters text,
    impression text,
    status text DEFAULT 'draft'::text NOT NULL,
    is_critical boolean DEFAULT false NOT NULL,
    critical_note text,
    critical_acknowledged_at timestamp with time zone,
    critical_acknowledged_by text,
    signature_id integer,
    signed_by_name text,
    signed_at timestamp with time zone,
    verified_by_signature_id integer,
    verified_by_name text,
    verified_at timestamp with time zone,
    verifier_notes text,
    delivered_at timestamp with time zone,
    template_id integer,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_token text,
    public_token_expires_at timestamp with time zone
);


ALTER TABLE public.patient_reports OWNER TO postgres;

--
-- Name: patient_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.patient_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patient_reports_id_seq OWNER TO postgres;

--
-- Name: patient_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.patient_reports_id_seq OWNED BY public.patient_reports.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patients (
    id integer NOT NULL,
    patient_id text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    date_of_birth text NOT NULL,
    gender text NOT NULL,
    phone text NOT NULL,
    email text,
    address text,
    blood_group text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ledger_id integer,
    photo_data_url text,
    portal_pin_hash text,
    age_value integer,
    age_unit text
);


ALTER TABLE public.patients OWNER TO postgres;

--
-- Name: patients_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.patients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patients_id_seq OWNER TO postgres;

--
-- Name: patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    bill_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    method text NOT NULL,
    reference_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_by_name text
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: portal_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.portal_sessions (
    id integer NOT NULL,
    token text NOT NULL,
    scope text NOT NULL,
    subject_id integer NOT NULL,
    subject_name text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.portal_sessions OWNER TO postgres;

--
-- Name: portal_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.portal_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.portal_sessions_id_seq OWNER TO postgres;

--
-- Name: portal_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.portal_sessions_id_seq OWNED BY public.portal_sessions.id;


--
-- Name: printer_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.printer_settings (
    id integer NOT NULL,
    bill_printer text DEFAULT ''::text NOT NULL,
    barcode_printer text DEFAULT ''::text NOT NULL,
    token_printer text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bill_printer_type text DEFAULT 'color'::text NOT NULL,
    token_printer_type text DEFAULT 'color'::text NOT NULL
);


ALTER TABLE public.printer_settings OWNER TO postgres;

--
-- Name: printer_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.printer_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.printer_settings_id_seq OWNER TO postgres;

--
-- Name: printer_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.printer_settings_id_seq OWNED BY public.printer_settings.id;


--
-- Name: radiology_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_audit_log (
    id integer NOT NULL,
    worklist_id integer,
    accession_number text,
    action text NOT NULL,
    actor text,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_audit_log OWNER TO postgres;

--
-- Name: radiology_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_audit_log_id_seq OWNER TO postgres;

--
-- Name: radiology_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_audit_log_id_seq OWNED BY public.radiology_audit_log.id;


--
-- Name: radiology_film_issues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_film_issues (
    id integer NOT NULL,
    study_id integer NOT NULL,
    issue_type text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    issued_by text,
    received_by text,
    notes text,
    issued_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_film_issues OWNER TO postgres;

--
-- Name: radiology_film_issues_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_film_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_film_issues_id_seq OWNER TO postgres;

--
-- Name: radiology_film_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_film_issues_id_seq OWNED BY public.radiology_film_issues.id;


--
-- Name: radiology_prompts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_prompts (
    id integer NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    test_name text,
    modality text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_prompts OWNER TO postgres;

--
-- Name: radiology_prompts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_prompts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_prompts_id_seq OWNER TO postgres;

--
-- Name: radiology_prompts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_prompts_id_seq OWNED BY public.radiology_prompts.id;


--
-- Name: radiology_report_drafts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_report_drafts (
    id integer NOT NULL,
    study_id integer,
    worklist_id integer,
    patient_id integer,
    template_id text,
    modality text,
    study_name text,
    clinical_history text,
    raw_findings text,
    findings_sections text,
    impression text,
    recommendation text,
    formatted_report_html text,
    formatted_report_text text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    final_report_id integer,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_report_drafts OWNER TO postgres;

--
-- Name: radiology_report_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_report_drafts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_report_drafts_id_seq OWNER TO postgres;

--
-- Name: radiology_report_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_report_drafts_id_seq OWNED BY public.radiology_report_drafts.id;


--
-- Name: radiology_report_key_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_report_key_images (
    id integer NOT NULL,
    draft_id integer,
    study_id integer,
    patient_id integer,
    accession_number text,
    image_url text NOT NULL,
    thumbnail_url text,
    caption text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    include_in_report boolean DEFAULT true NOT NULL,
    source_type text DEFAULT 'UPLOAD'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_report_key_images OWNER TO postgres;

--
-- Name: radiology_report_key_images_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_report_key_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_report_key_images_id_seq OWNER TO postgres;

--
-- Name: radiology_report_key_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_report_key_images_id_seq OWNED BY public.radiology_report_key_images.id;


--
-- Name: radiology_scheduled_procedures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_scheduled_procedures (
    id integer NOT NULL,
    accession_number text NOT NULL,
    patient_id text,
    patient_name text,
    patient_sex text,
    patient_age text,
    patient_dob text,
    modality text,
    procedure_name text,
    procedure_code text,
    study_description text,
    referring_doctor text,
    referring_doctor_id text,
    scheduled_date text,
    scheduled_time text,
    station_ae_title text,
    body_part_examined text,
    status text DEFAULT 'SCHEDULED'::text NOT NULL,
    source_bill_id text,
    source_order_id text,
    source_appointment_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_scheduled_procedures OWNER TO postgres;

--
-- Name: radiology_scheduled_procedures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_scheduled_procedures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_scheduled_procedures_id_seq OWNER TO postgres;

--
-- Name: radiology_scheduled_procedures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_scheduled_procedures_id_seq OWNED BY public.radiology_scheduled_procedures.id;


--
-- Name: radiology_share_links; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_share_links (
    id integer NOT NULL,
    token text NOT NULL,
    study_id integer NOT NULL,
    audience text DEFAULT 'patient'::text NOT NULL,
    created_by text,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    access_count integer DEFAULT 0 NOT NULL,
    last_accessed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_share_links OWNER TO postgres;

--
-- Name: radiology_share_links_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_share_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_share_links_id_seq OWNER TO postgres;

--
-- Name: radiology_share_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_share_links_id_seq OWNED BY public.radiology_share_links.id;


--
-- Name: radiology_studies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_studies (
    id integer NOT NULL,
    accession_number text NOT NULL,
    bill_id integer,
    order_id integer,
    order_test_id integer,
    patient_id integer NOT NULL,
    test_id integer NOT NULL,
    modality text DEFAULT 'OT'::text NOT NULL,
    department text DEFAULT 'X-Ray'::text NOT NULL,
    room_number text DEFAULT ''::text NOT NULL,
    technician_id integer,
    technician_name text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    acquired_at timestamp with time zone,
    delivered_at timestamp with time zone,
    num_images integer DEFAULT 0 NOT NULL,
    study_instance_uid text,
    notes text,
    prelim_report text,
    prelim_reported_by text,
    prelim_reported_at timestamp with time zone,
    final_report text,
    final_reported_by text,
    final_reported_at timestamp with time zone,
    template_id integer,
    study_date date DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_radiologist_id integer,
    assigned_radiologist_name text,
    claimed_at timestamp with time zone,
    clinical_history text,
    body_part text,
    study_description text,
    scheduled_station_ae_title text,
    referring_doctor text
);


ALTER TABLE public.radiology_studies OWNER TO postgres;

--
-- Name: radiology_studies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_studies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_studies_id_seq OWNER TO postgres;

--
-- Name: radiology_studies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_studies_id_seq OWNED BY public.radiology_studies.id;


--
-- Name: radiology_voice_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_voice_logs (
    id integer NOT NULL,
    draft_id integer,
    study_id integer,
    patient_id integer,
    target_field text,
    raw_transcript text,
    cleaned_text text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.radiology_voice_logs OWNER TO postgres;

--
-- Name: radiology_voice_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_voice_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_voice_logs_id_seq OWNER TO postgres;

--
-- Name: radiology_voice_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_voice_logs_id_seq OWNED BY public.radiology_voice_logs.id;


--
-- Name: radiology_worklist; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.radiology_worklist (
    id integer NOT NULL,
    study_id integer,
    patient_id integer,
    patient_name text NOT NULL,
    age text,
    sex text,
    modality text DEFAULT 'OT'::text NOT NULL,
    study_description text,
    study_date text,
    accession_number text NOT NULL,
    study_instance_uid text,
    ae_title text,
    ip_address text,
    port integer,
    referring_doctor text,
    weasis_url text,
    status text DEFAULT 'STUDY_RECEIVED'::text NOT NULL,
    assigned_radiologist text,
    ai_draft_status text DEFAULT 'NONE'::text NOT NULL,
    ai_draft_json text,
    report_id integer,
    delivery_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dicom_patient_id text,
    patient_match_status text DEFAULT 'UNMATCHED'::text NOT NULL
);


ALTER TABLE public.radiology_worklist OWNER TO postgres;

--
-- Name: radiology_worklist_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.radiology_worklist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.radiology_worklist_id_seq OWNER TO postgres;

--
-- Name: radiology_worklist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.radiology_worklist_id_seq OWNED BY public.radiology_worklist.id;


--
-- Name: report_shares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_shares (
    id integer NOT NULL,
    report_id integer NOT NULL,
    channel text NOT NULL,
    recipient text,
    shared_by text,
    status text DEFAULT 'sent'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.report_shares OWNER TO postgres;

--
-- Name: report_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.report_shares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.report_shares_id_seq OWNER TO postgres;

--
-- Name: report_shares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.report_shares_id_seq OWNED BY public.report_shares.id;


--
-- Name: report_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.report_templates (
    id integer NOT NULL,
    test_id integer NOT NULL,
    name text NOT NULL,
    format text DEFAULT 'text'::text NOT NULL,
    content text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text,
    modality text
);


ALTER TABLE public.report_templates OWNER TO postgres;

--
-- Name: report_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.report_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.report_templates_id_seq OWNER TO postgres;

--
-- Name: report_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.report_templates_id_seq OWNED BY public.report_templates.id;


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rooms (
    id integer NOT NULL,
    name text NOT NULL,
    code text DEFAULT ''::text NOT NULL,
    floor_id integer,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rooms OWNER TO postgres;

--
-- Name: rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.rooms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rooms_id_seq OWNER TO postgres;

--
-- Name: rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.rooms_id_seq OWNED BY public.rooms.id;


--
-- Name: sample_test_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sample_test_assignments (
    id integer NOT NULL,
    sample_id integer NOT NULL,
    order_test_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sample_test_assignments OWNER TO postgres;

--
-- Name: sample_test_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sample_test_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sample_test_assignments_id_seq OWNER TO postgres;

--
-- Name: sample_test_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sample_test_assignments_id_seq OWNED BY public.sample_test_assignments.id;


--
-- Name: samples; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.samples (
    id integer NOT NULL,
    barcode text NOT NULL,
    order_id integer NOT NULL,
    patient_id integer NOT NULL,
    sample_type text DEFAULT 'Blood'::text NOT NULL,
    container_type text DEFAULT 'Plain'::text NOT NULL,
    volume text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'collected'::text NOT NULL,
    collected_by_name text DEFAULT ''::text NOT NULL,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    collection_site text DEFAULT 'Center'::text NOT NULL,
    received_at timestamp with time zone,
    processing_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    reported_at timestamp with time zone,
    rejected_at timestamp with time zone,
    rejection_reason text,
    is_outsourced boolean DEFAULT false NOT NULL,
    outsource_lab text,
    outsource_sent_at timestamp with time zone,
    outsource_expected_at text,
    outsource_received_at timestamp with time zone,
    outsource_tracking_id text,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.samples OWNER TO postgres;

--
-- Name: samples_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.samples_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.samples_id_seq OWNER TO postgres;

--
-- Name: samples_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.samples_id_seq OWNED BY public.samples.id;


--
-- Name: signatures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.signatures (
    id integer NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'Doctor'::text NOT NULL,
    qualification text DEFAULT ''::text NOT NULL,
    registration_no text DEFAULT ''::text NOT NULL,
    image_data_url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.signatures OWNER TO postgres;

--
-- Name: signatures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.signatures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.signatures_id_seq OWNER TO postgres;

--
-- Name: signatures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.signatures_id_seq OWNED BY public.signatures.id;


--
-- Name: site_faqs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_faqs (
    id integer NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.site_faqs OWNER TO postgres;

--
-- Name: site_faqs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.site_faqs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_faqs_id_seq OWNER TO postgres;

--
-- Name: site_faqs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.site_faqs_id_seq OWNED BY public.site_faqs.id;


--
-- Name: site_pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_pages (
    id integer NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    show_in_nav boolean DEFAULT true NOT NULL,
    sections text DEFAULT '[]'::text NOT NULL,
    seo_meta_title text DEFAULT ''::text NOT NULL,
    seo_meta_description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.site_pages OWNER TO postgres;

--
-- Name: site_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.site_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_pages_id_seq OWNER TO postgres;

--
-- Name: site_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.site_pages_id_seq OWNED BY public.site_pages.id;


--
-- Name: site_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_photos (
    id integer NOT NULL,
    url text NOT NULL,
    alt text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.site_photos OWNER TO postgres;

--
-- Name: site_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.site_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_photos_id_seq OWNER TO postgres;

--
-- Name: site_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.site_photos_id_seq OWNED BY public.site_photos.id;


--
-- Name: site_popups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_popups (
    id integer NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    cta_label text DEFAULT ''::text NOT NULL,
    cta_url text DEFAULT ''::text NOT NULL,
    image_url text DEFAULT ''::text NOT NULL,
    trigger_type text DEFAULT 'time_delay'::text NOT NULL,
    trigger_value integer DEFAULT 5 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.site_popups OWNER TO postgres;

--
-- Name: site_popups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.site_popups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_popups_id_seq OWNER TO postgres;

--
-- Name: site_popups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.site_popups_id_seq OWNED BY public.site_popups.id;


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.site_settings (
    id integer NOT NULL,
    site_title text DEFAULT ''::text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    about text DEFAULT ''::text NOT NULL,
    contact_email text DEFAULT ''::text NOT NULL,
    contact_phone text DEFAULT ''::text NOT NULL,
    whatsapp_number text DEFAULT ''::text NOT NULL,
    whatsapp_enabled boolean DEFAULT false NOT NULL,
    whatsapp_greeting text DEFAULT 'Hi! I''d like to book an appointment.'::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    favicon_url text DEFAULT ''::text NOT NULL,
    logo_url text DEFAULT ''::text NOT NULL,
    theme_id text DEFAULT 'modern-clinical'::text NOT NULL,
    primary_color text DEFAULT '#7c3aed'::text NOT NULL,
    secondary_color text DEFAULT '#06b6d4'::text NOT NULL,
    accent_color text DEFAULT '#f59e0b'::text NOT NULL,
    background_color text DEFAULT '#ffffff'::text NOT NULL,
    font_heading text DEFAULT 'Inter'::text NOT NULL,
    font_body text DEFAULT 'Inter'::text NOT NULL,
    button_style text DEFAULT 'rounded'::text NOT NULL,
    custom_domain text DEFAULT ''::text NOT NULL,
    domain_verified boolean DEFAULT false NOT NULL,
    domain_verified_at timestamp with time zone,
    seo_meta_title text DEFAULT ''::text NOT NULL,
    seo_meta_description text DEFAULT ''::text NOT NULL,
    seo_keywords text DEFAULT ''::text NOT NULL,
    seo_og_image text DEFAULT ''::text NOT NULL,
    google_analytics_id text DEFAULT ''::text NOT NULL,
    google_tag_manager_id text DEFAULT ''::text NOT NULL,
    google_adsense_id text DEFAULT ''::text NOT NULL,
    meta_pixel_id text DEFAULT ''::text NOT NULL,
    facebook_meta_tag text DEFAULT ''::text NOT NULL,
    pinterest_meta_tag text DEFAULT ''::text NOT NULL,
    custom_head_html text DEFAULT ''::text NOT NULL,
    social_links text DEFAULT '{}'::text NOT NULL,
    site_history text DEFAULT '[]'::text NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    last_published_at timestamp with time zone,
    published_revision integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.site_settings OWNER TO postgres;

--
-- Name: site_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.site_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_settings_id_seq OWNER TO postgres;

--
-- Name: site_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.site_settings_id_seq OWNED BY public.site_settings.id;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff (
    id integer NOT NULL,
    staff_id text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    phone text,
    email text,
    role text NOT NULL,
    department text,
    joining_date date,
    base_salary numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    address text,
    emergency_contact text,
    bank_account text,
    ifsc text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff OWNER TO postgres;

--
-- Name: staff_advances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_advances (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    advance_date date NOT NULL,
    payment_mode text DEFAULT 'cash'::text NOT NULL,
    reason text,
    recovered_amount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'outstanding'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff_advances OWNER TO postgres;

--
-- Name: staff_advances_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_advances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_advances_id_seq OWNER TO postgres;

--
-- Name: staff_advances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_advances_id_seq OWNED BY public.staff_advances.id;


--
-- Name: staff_attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_attendance (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    attendance_date date NOT NULL,
    punch_in timestamp with time zone,
    punch_out timestamp with time zone,
    source text DEFAULT 'manual'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff_attendance OWNER TO postgres;

--
-- Name: staff_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_attendance_id_seq OWNER TO postgres;

--
-- Name: staff_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_attendance_id_seq OWNED BY public.staff_attendance.id;


--
-- Name: staff_biometric_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_biometric_credentials (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    credential_id text NOT NULL,
    public_key text NOT NULL,
    device_name text,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    counter bigint DEFAULT 0 NOT NULL,
    transports text
);


ALTER TABLE public.staff_biometric_credentials OWNER TO postgres;

--
-- Name: staff_biometric_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_biometric_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_biometric_credentials_id_seq OWNER TO postgres;

--
-- Name: staff_biometric_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_biometric_credentials_id_seq OWNED BY public.staff_biometric_credentials.id;


--
-- Name: staff_counter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_counter (
    id integer NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.staff_counter OWNER TO postgres;

--
-- Name: staff_counter_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_counter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_counter_id_seq OWNER TO postgres;

--
-- Name: staff_counter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_counter_id_seq OWNED BY public.staff_counter.id;


--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_id_seq OWNER TO postgres;

--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_id_seq OWNED BY public.staff.id;


--
-- Name: staff_salary_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_salary_payments (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    month_year text NOT NULL,
    base_amount numeric(10,2) NOT NULL,
    bonus numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    deductions numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    advance_deducted numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    days_present integer DEFAULT 0 NOT NULL,
    days_absent integer DEFAULT 0 NOT NULL,
    net_amount numeric(10,2) NOT NULL,
    payment_date date NOT NULL,
    payment_mode text DEFAULT 'cash'::text NOT NULL,
    reference text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff_salary_payments OWNER TO postgres;

--
-- Name: staff_salary_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_salary_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_salary_payments_id_seq OWNER TO postgres;

--
-- Name: staff_salary_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.staff_salary_payments_id_seq OWNED BY public.staff_salary_payments.id;


--
-- Name: super_admin_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.super_admin_sessions (
    token character varying(128) NOT NULL,
    user_id integer NOT NULL,
    user_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.super_admin_sessions OWNER TO postgres;

--
-- Name: test_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.test_categories (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.test_categories OWNER TO postgres;

--
-- Name: test_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.test_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.test_categories_id_seq OWNER TO postgres;

--
-- Name: test_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.test_categories_id_seq OWNED BY public.test_categories.id;


--
-- Name: test_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.test_tokens (
    id integer NOT NULL,
    ledger_id integer,
    bill_id integer,
    order_id integer,
    order_test_id integer,
    test_id integer,
    patient_id integer,
    department text DEFAULT 'Pathology'::text NOT NULL,
    room_number text DEFAULT ''::text NOT NULL,
    token_no integer NOT NULL,
    token_date date NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    called_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'walkin'::text NOT NULL
);


ALTER TABLE public.test_tokens OWNER TO postgres;

--
-- Name: test_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.test_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.test_tokens_id_seq OWNER TO postgres;

--
-- Name: test_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.test_tokens_id_seq OWNED BY public.test_tokens.id;


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tokens (
    id integer NOT NULL,
    ledger_id integer,
    bill_id integer,
    patient_id integer,
    token_no integer NOT NULL,
    token_date date NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'walkin'::text NOT NULL
);


ALTER TABLE public.tokens OWNER TO postgres;

--
-- Name: tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tokens_id_seq OWNER TO postgres;

--
-- Name: tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tokens_id_seq OWNED BY public.tokens.id;


--
-- Name: user_day_closures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_day_closures (
    id integer NOT NULL,
    user_id integer,
    user_name text NOT NULL,
    closure_date date NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    covered_from_ts timestamp with time zone,
    covered_to_ts timestamp with time zone DEFAULT now() NOT NULL,
    expected_cash numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    expected_upi numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    expected_card numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    expected_cheque numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    expected_other numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total_expected numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total_billed numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total_due numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    bills_count integer DEFAULT 0 NOT NULL,
    payments_count integer DEFAULT 0 NOT NULL,
    actual_cash numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    actual_upi numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    actual_card numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    actual_cheque numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    actual_other numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    total_actual numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    variance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    variance_note text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    denominations jsonb DEFAULT 'null'::jsonb,
    denomination_total numeric(12,2),
    drawer_status text DEFAULT 'closed'::text NOT NULL,
    approved_by_name text,
    approved_at timestamp with time zone,
    approval_note text,
    reopened_by_name text,
    reopened_at timestamp with time zone,
    reopen_reason text
);


ALTER TABLE public.user_day_closures OWNER TO postgres;

--
-- Name: user_day_closures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_day_closures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_day_closures_id_seq OWNER TO postgres;

--
-- Name: user_day_closures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_day_closures_id_seq OWNED BY public.user_day_closures.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_sessions (
    id integer NOT NULL,
    token text NOT NULL,
    user_id integer NOT NULL,
    user_name text NOT NULL,
    login_method text DEFAULT 'fingerprint'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO postgres;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_sessions_id_seq OWNER TO postgres;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'receptionist'::text NOT NULL,
    permissions text,
    pin text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_discount numeric(5,2),
    username text,
    photo_data_url text,
    must_change_pin boolean DEFAULT false NOT NULL,
    sidebar_theme text,
    dicom_presets jsonb,
    remote_login_enabled boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    address text,
    city text,
    state text,
    pincode text,
    gstin text,
    payment_terms text,
    category text,
    opening_balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vendors OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendors_id_seq OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: voucher_audits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.voucher_audits (
    id integer NOT NULL,
    voucher_id integer NOT NULL,
    voucher_number text NOT NULL,
    edited_by text NOT NULL,
    reason text NOT NULL,
    change_type text NOT NULL,
    old_value text,
    new_value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.voucher_audits OWNER TO postgres;

--
-- Name: voucher_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.voucher_audits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.voucher_audits_id_seq OWNER TO postgres;

--
-- Name: voucher_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.voucher_audits_id_seq OWNED BY public.voucher_audits.id;


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vouchers (
    id integer NOT NULL,
    voucher_number text NOT NULL,
    type text NOT NULL,
    date text NOT NULL,
    credit_account_id text NOT NULL,
    debit_account_id text NOT NULL,
    amount numeric(12,2) NOT NULL,
    particular text NOT NULL,
    remark text,
    performed_by text,
    reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    narration text,
    bill_id integer
);


ALTER TABLE public.vouchers OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vouchers_id_seq OWNER TO postgres;

--
-- Name: vouchers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;


--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_conversations (
    id integer NOT NULL,
    phone text NOT NULL,
    customer_name text DEFAULT ''::text NOT NULL,
    direction text DEFAULT 'incoming'::text NOT NULL,
    message_body text DEFAULT ''::text NOT NULL,
    wa_message_id text DEFAULT ''::text NOT NULL,
    ai_handled boolean DEFAULT false NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.whatsapp_conversations OWNER TO postgres;

--
-- Name: whatsapp_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.whatsapp_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.whatsapp_conversations_id_seq OWNER TO postgres;

--
-- Name: whatsapp_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.whatsapp_conversations_id_seq OWNED BY public.whatsapp_conversations.id;


--
-- Name: whatsapp_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_settings (
    id integer NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    phone_number_id text DEFAULT ''::text NOT NULL,
    access_token text DEFAULT ''::text NOT NULL,
    template_name text DEFAULT ''::text NOT NULL,
    template_lang text DEFAULT 'en'::text NOT NULL,
    default_country_code text DEFAULT '91'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_send_on_verify boolean DEFAULT false NOT NULL,
    report_message_template text DEFAULT ''::text NOT NULL,
    include_viewer_link boolean DEFAULT true NOT NULL,
    webhook_verify_token text DEFAULT ''::text NOT NULL,
    ai_assistant_name text DEFAULT 'DiagnoCenter Assistant'::text NOT NULL,
    waba_id text DEFAULT ''::text NOT NULL,
    ai_assistant_enabled boolean DEFAULT false NOT NULL,
    ai_system_prompt text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.whatsapp_settings OWNER TO postgres;

--
-- Name: whatsapp_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.whatsapp_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.whatsapp_settings_id_seq OWNER TO postgres;

--
-- Name: whatsapp_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.whatsapp_settings_id_seq OWNED BY public.whatsapp_settings.id;


--
-- Name: abnormal_findings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormal_findings ALTER COLUMN id SET DEFAULT nextval('public.abnormal_findings_id_seq'::regclass);


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: ai_provider_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_provider_settings ALTER COLUMN id SET DEFAULT nextval('public.ai_provider_settings_id_seq'::regclass);


--
-- Name: ai_reporting_audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_reporting_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.ai_reporting_audit_logs_id_seq'::regclass);


--
-- Name: ai_reporting_drafts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_reporting_drafts ALTER COLUMN id SET DEFAULT nextval('public.ai_reporting_drafts_id_seq'::regclass);


--
-- Name: appointment_counter id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointment_counter ALTER COLUMN id SET DEFAULT nextval('public.appointment_counter_id_seq'::regclass);


--
-- Name: appointments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments ALTER COLUMN id SET DEFAULT nextval('public.appointments_id_seq'::regclass);


--
-- Name: audit_runs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_runs ALTER COLUMN id SET DEFAULT nextval('public.audit_runs_id_seq'::regclass);


--
-- Name: backup_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.backup_logs ALTER COLUMN id SET DEFAULT nextval('public.backup_logs_id_seq'::regclass);


--
-- Name: bill_audits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bill_audits ALTER COLUMN id SET DEFAULT nextval('public.bill_audits_id_seq'::regclass);


--
-- Name: bills id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bills ALTER COLUMN id SET DEFAULT nextval('public.bills_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: bridge_fingerprint_templates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bridge_fingerprint_templates ALTER COLUMN id SET DEFAULT nextval('public.bridge_fingerprint_templates_id_seq'::regclass);


--
-- Name: clinic_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinic_settings ALTER COLUMN id SET DEFAULT nextval('public.clinic_settings_id_seq'::regclass);


--
-- Name: commission_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commission_rules ALTER COLUMN id SET DEFAULT nextval('public.commission_rules_id_seq'::regclass);


--
-- Name: day_closures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.day_closures ALTER COLUMN id SET DEFAULT nextval('public.day_closures_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: diagnostic_tests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.diagnostic_tests ALTER COLUMN id SET DEFAULT nextval('public.diagnostic_tests_id_seq'::regclass);


--
-- Name: dicom_failed_retrieval_queue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_failed_retrieval_queue ALTER COLUMN id SET DEFAULT nextval('public.dicom_failed_retrieval_queue_id_seq'::regclass);


--
-- Name: dicom_modalities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_modalities ALTER COLUMN id SET DEFAULT nextval('public.dicom_modalities_id_seq'::regclass);


--
-- Name: dicom_nodes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_nodes ALTER COLUMN id SET DEFAULT nextval('public.dicom_nodes_id_seq'::regclass);


--
-- Name: dicom_pull_agent_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pull_agent_logs ALTER COLUMN id SET DEFAULT nextval('public.dicom_pull_agent_logs_id_seq'::regclass);


--
-- Name: dicom_pull_agent_status id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pull_agent_status ALTER COLUMN id SET DEFAULT nextval('public.dicom_pull_agent_status_id_seq'::regclass);


--
-- Name: dicom_pull_jobs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pull_jobs ALTER COLUMN id SET DEFAULT nextval('public.dicom_pull_jobs_id_seq'::regclass);


--
-- Name: dicom_pulled_studies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pulled_studies ALTER COLUMN id SET DEFAULT nextval('public.dicom_pulled_studies_id_seq'::regclass);


--
-- Name: dicom_routing_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_routing_rules ALTER COLUMN id SET DEFAULT nextval('public.dicom_routing_rules_id_seq'::regclass);


--
-- Name: discount_reasons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_reasons ALTER COLUMN id SET DEFAULT nextval('public.discount_reasons_id_seq'::regclass);


--
-- Name: discount_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_rules ALTER COLUMN id SET DEFAULT nextval('public.discount_rules_id_seq'::regclass);


--
-- Name: doctor_payouts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor_payouts ALTER COLUMN id SET DEFAULT nextval('public.doctor_payouts_id_seq'::regclass);


--
-- Name: doctors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctors ALTER COLUMN id SET DEFAULT nextval('public.doctors_id_seq'::regclass);


--
-- Name: drawer_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drawer_audit_log ALTER COLUMN id SET DEFAULT nextval('public.drawer_audit_log_id_seq'::regclass);


--
-- Name: email_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_settings ALTER COLUMN id SET DEFAULT nextval('public.email_settings_id_seq'::regclass);


--
-- Name: expense_counter id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense_counter ALTER COLUMN id SET DEFAULT nextval('public.expense_counter_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: floors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.floors ALTER COLUMN id SET DEFAULT nextval('public.floors_id_seq'::regclass);


--
-- Name: form_f_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_f_records ALTER COLUMN id SET DEFAULT nextval('public.form_f_records_id_seq'::regclass);


--
-- Name: hr_rejoining_form_counter id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_rejoining_form_counter ALTER COLUMN id SET DEFAULT nextval('public.hr_rejoining_form_counter_id_seq'::regclass);


--
-- Name: hr_rejoining_forms id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_rejoining_forms ALTER COLUMN id SET DEFAULT nextval('public.hr_rejoining_forms_id_seq'::regclass);


--
-- Name: inventory_consumption_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_consumption_rules ALTER COLUMN id SET DEFAULT nextval('public.inventory_consumption_rules_id_seq'::regclass);


--
-- Name: inventory_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_items_id_seq'::regclass);


--
-- Name: inventory_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions ALTER COLUMN id SET DEFAULT nextval('public.inventory_transactions_id_seq'::regclass);


--
-- Name: kiosk_payment_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kiosk_payment_sessions ALTER COLUMN id SET DEFAULT nextval('public.kiosk_payment_sessions_id_seq'::regclass);


--
-- Name: ledgers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledgers ALTER COLUMN id SET DEFAULT nextval('public.ledgers_id_seq'::regclass);


--
-- Name: machine_amc_contracts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_amc_contracts ALTER COLUMN id SET DEFAULT nextval('public.machine_amc_contracts_id_seq'::regclass);


--
-- Name: machine_breakdowns id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_breakdowns ALTER COLUMN id SET DEFAULT nextval('public.machine_breakdowns_id_seq'::regclass);


--
-- Name: machine_service_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_service_records ALTER COLUMN id SET DEFAULT nextval('public.machine_service_records_id_seq'::regclass);


--
-- Name: machines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machines ALTER COLUMN id SET DEFAULT nextval('public.machines_id_seq'::regclass);


--
-- Name: modalities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modalities ALTER COLUMN id SET DEFAULT nextval('public.modalities_id_seq'::regclass);


--
-- Name: online_bookings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.online_bookings ALTER COLUMN id SET DEFAULT nextval('public.online_bookings_id_seq'::regclass);


--
-- Name: order_tests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_tests ALTER COLUMN id SET DEFAULT nextval('public.order_tests_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: outsourced_labs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outsourced_labs ALTER COLUMN id SET DEFAULT nextval('public.outsourced_labs_id_seq'::regclass);


--
-- Name: package_counter id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_counter ALTER COLUMN id SET DEFAULT nextval('public.package_counter_id_seq'::regclass);


--
-- Name: package_tests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_tests ALTER COLUMN id SET DEFAULT nextval('public.package_tests_id_seq'::regclass);


--
-- Name: packages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.packages ALTER COLUMN id SET DEFAULT nextval('public.packages_id_seq'::regclass);


--
-- Name: pacs_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pacs_logs ALTER COLUMN id SET DEFAULT nextval('public.pacs_logs_id_seq'::regclass);


--
-- Name: pacs_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pacs_settings ALTER COLUMN id SET DEFAULT nextval('public.pacs_settings_id_seq'::regclass);


--
-- Name: patient_counter id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_counter ALTER COLUMN id SET DEFAULT nextval('public.patient_counter_id_seq'::regclass);


--
-- Name: patient_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_reports ALTER COLUMN id SET DEFAULT nextval('public.patient_reports_id_seq'::regclass);


--
-- Name: patients id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: portal_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_sessions ALTER COLUMN id SET DEFAULT nextval('public.portal_sessions_id_seq'::regclass);


--
-- Name: printer_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.printer_settings ALTER COLUMN id SET DEFAULT nextval('public.printer_settings_id_seq'::regclass);


--
-- Name: radiology_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_audit_log ALTER COLUMN id SET DEFAULT nextval('public.radiology_audit_log_id_seq'::regclass);


--
-- Name: radiology_film_issues id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_film_issues ALTER COLUMN id SET DEFAULT nextval('public.radiology_film_issues_id_seq'::regclass);


--
-- Name: radiology_prompts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_prompts ALTER COLUMN id SET DEFAULT nextval('public.radiology_prompts_id_seq'::regclass);


--
-- Name: radiology_report_drafts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_report_drafts ALTER COLUMN id SET DEFAULT nextval('public.radiology_report_drafts_id_seq'::regclass);


--
-- Name: radiology_report_key_images id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_report_key_images ALTER COLUMN id SET DEFAULT nextval('public.radiology_report_key_images_id_seq'::regclass);


--
-- Name: radiology_scheduled_procedures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_scheduled_procedures ALTER COLUMN id SET DEFAULT nextval('public.radiology_scheduled_procedures_id_seq'::regclass);


--
-- Name: radiology_share_links id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_share_links ALTER COLUMN id SET DEFAULT nextval('public.radiology_share_links_id_seq'::regclass);


--
-- Name: radiology_studies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_studies ALTER COLUMN id SET DEFAULT nextval('public.radiology_studies_id_seq'::regclass);


--
-- Name: radiology_voice_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_voice_logs ALTER COLUMN id SET DEFAULT nextval('public.radiology_voice_logs_id_seq'::regclass);


--
-- Name: radiology_worklist id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_worklist ALTER COLUMN id SET DEFAULT nextval('public.radiology_worklist_id_seq'::regclass);


--
-- Name: report_shares id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_shares ALTER COLUMN id SET DEFAULT nextval('public.report_shares_id_seq'::regclass);


--
-- Name: report_templates id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_templates ALTER COLUMN id SET DEFAULT nextval('public.report_templates_id_seq'::regclass);


--
-- Name: rooms id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rooms ALTER COLUMN id SET DEFAULT nextval('public.rooms_id_seq'::regclass);


--
-- Name: sample_test_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sample_test_assignments ALTER COLUMN id SET DEFAULT nextval('public.sample_test_assignments_id_seq'::regclass);


--
-- Name: samples id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.samples ALTER COLUMN id SET DEFAULT nextval('public.samples_id_seq'::regclass);


--
-- Name: signatures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signatures ALTER COLUMN id SET DEFAULT nextval('public.signatures_id_seq'::regclass);


--
-- Name: site_faqs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_faqs ALTER COLUMN id SET DEFAULT nextval('public.site_faqs_id_seq'::regclass);


--
-- Name: site_pages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_pages ALTER COLUMN id SET DEFAULT nextval('public.site_pages_id_seq'::regclass);


--
-- Name: site_photos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_photos ALTER COLUMN id SET DEFAULT nextval('public.site_photos_id_seq'::regclass);


--
-- Name: site_popups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_popups ALTER COLUMN id SET DEFAULT nextval('public.site_popups_id_seq'::regclass);


--
-- Name: site_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_settings ALTER COLUMN id SET DEFAULT nextval('public.site_settings_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff ALTER COLUMN id SET DEFAULT nextval('public.staff_id_seq'::regclass);


--
-- Name: staff_advances id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_advances ALTER COLUMN id SET DEFAULT nextval('public.staff_advances_id_seq'::regclass);


--
-- Name: staff_attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_attendance ALTER COLUMN id SET DEFAULT nextval('public.staff_attendance_id_seq'::regclass);


--
-- Name: staff_biometric_credentials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_biometric_credentials ALTER COLUMN id SET DEFAULT nextval('public.staff_biometric_credentials_id_seq'::regclass);


--
-- Name: staff_counter id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_counter ALTER COLUMN id SET DEFAULT nextval('public.staff_counter_id_seq'::regclass);


--
-- Name: staff_salary_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_salary_payments ALTER COLUMN id SET DEFAULT nextval('public.staff_salary_payments_id_seq'::regclass);


--
-- Name: test_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_categories ALTER COLUMN id SET DEFAULT nextval('public.test_categories_id_seq'::regclass);


--
-- Name: test_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_tokens ALTER COLUMN id SET DEFAULT nextval('public.test_tokens_id_seq'::regclass);


--
-- Name: tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tokens ALTER COLUMN id SET DEFAULT nextval('public.tokens_id_seq'::regclass);


--
-- Name: user_day_closures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_day_closures ALTER COLUMN id SET DEFAULT nextval('public.user_day_closures_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Name: voucher_audits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_audits ALTER COLUMN id SET DEFAULT nextval('public.voucher_audits_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Name: whatsapp_conversations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_conversations_id_seq'::regclass);


--
-- Name: whatsapp_settings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_settings ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_settings_id_seq'::regclass);


--
-- Name: abnormal_findings abnormal_findings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.abnormal_findings
    ADD CONSTRAINT abnormal_findings_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_unique UNIQUE (code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: ai_provider_settings ai_provider_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_provider_settings
    ADD CONSTRAINT ai_provider_settings_pkey PRIMARY KEY (id);


--
-- Name: ai_reporting_audit_logs ai_reporting_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_reporting_audit_logs
    ADD CONSTRAINT ai_reporting_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_reporting_drafts ai_reporting_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_reporting_drafts
    ADD CONSTRAINT ai_reporting_drafts_pkey PRIMARY KEY (id);


--
-- Name: appointment_counter appointment_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointment_counter
    ADD CONSTRAINT appointment_counter_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_appointment_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_appointment_id_unique UNIQUE (appointment_id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: audit_runs audit_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_runs
    ADD CONSTRAINT audit_runs_pkey PRIMARY KEY (id);


--
-- Name: backup_logs backup_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.backup_logs
    ADD CONSTRAINT backup_logs_pkey PRIMARY KEY (id);


--
-- Name: bill_audits bill_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bill_audits
    ADD CONSTRAINT bill_audits_pkey PRIMARY KEY (id);


--
-- Name: bills bills_bill_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_bill_number_unique UNIQUE (bill_number);


--
-- Name: bills bills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_pkey PRIMARY KEY (id);


--
-- Name: branches branches_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_code_unique UNIQUE (code);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: bridge_fingerprint_templates bridge_fingerprint_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bridge_fingerprint_templates
    ADD CONSTRAINT bridge_fingerprint_templates_pkey PRIMARY KEY (id);


--
-- Name: clinic_settings clinic_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clinic_settings
    ADD CONSTRAINT clinic_settings_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: day_closures day_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.day_closures
    ADD CONSTRAINT day_closures_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_unique UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: diagnostic_tests diagnostic_tests_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.diagnostic_tests
    ADD CONSTRAINT diagnostic_tests_code_unique UNIQUE (code);


--
-- Name: diagnostic_tests diagnostic_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.diagnostic_tests
    ADD CONSTRAINT diagnostic_tests_pkey PRIMARY KEY (id);


--
-- Name: dicom_failed_retrieval_queue dicom_failed_retrieval_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_failed_retrieval_queue
    ADD CONSTRAINT dicom_failed_retrieval_queue_pkey PRIMARY KEY (id);


--
-- Name: dicom_modalities dicom_modalities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_modalities
    ADD CONSTRAINT dicom_modalities_pkey PRIMARY KEY (id);


--
-- Name: dicom_nodes dicom_nodes_ae_title_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_nodes
    ADD CONSTRAINT dicom_nodes_ae_title_unique UNIQUE (ae_title);


--
-- Name: dicom_nodes dicom_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_nodes
    ADD CONSTRAINT dicom_nodes_pkey PRIMARY KEY (id);


--
-- Name: dicom_pull_agent_logs dicom_pull_agent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pull_agent_logs
    ADD CONSTRAINT dicom_pull_agent_logs_pkey PRIMARY KEY (id);


--
-- Name: dicom_pull_agent_status dicom_pull_agent_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pull_agent_status
    ADD CONSTRAINT dicom_pull_agent_status_pkey PRIMARY KEY (id);


--
-- Name: dicom_pull_jobs dicom_pull_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pull_jobs
    ADD CONSTRAINT dicom_pull_jobs_pkey PRIMARY KEY (id);


--
-- Name: dicom_pulled_studies dicom_pulled_studies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pulled_studies
    ADD CONSTRAINT dicom_pulled_studies_pkey PRIMARY KEY (id);


--
-- Name: dicom_pulled_studies dicom_pulled_studies_study_instance_uid_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_pulled_studies
    ADD CONSTRAINT dicom_pulled_studies_study_instance_uid_unique UNIQUE (study_instance_uid);


--
-- Name: dicom_routing_rules dicom_routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dicom_routing_rules
    ADD CONSTRAINT dicom_routing_rules_pkey PRIMARY KEY (id);


--
-- Name: discount_reasons discount_reasons_label_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_reasons
    ADD CONSTRAINT discount_reasons_label_unique UNIQUE (label);


--
-- Name: discount_reasons discount_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_reasons
    ADD CONSTRAINT discount_reasons_pkey PRIMARY KEY (id);


--
-- Name: discount_rules discount_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_rules
    ADD CONSTRAINT discount_rules_pkey PRIMARY KEY (id);


--
-- Name: doctor_payouts doctor_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor_payouts
    ADD CONSTRAINT doctor_payouts_pkey PRIMARY KEY (id);


--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: drawer_audit_log drawer_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drawer_audit_log
    ADD CONSTRAINT drawer_audit_log_pkey PRIMARY KEY (id);


--
-- Name: email_settings email_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (id);


--
-- Name: expense_counter expense_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense_counter
    ADD CONSTRAINT expense_counter_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_expense_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_expense_id_unique UNIQUE (expense_id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: floors floors_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.floors
    ADD CONSTRAINT floors_name_unique UNIQUE (name);


--
-- Name: floors floors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.floors
    ADD CONSTRAINT floors_pkey PRIMARY KEY (id);


--
-- Name: form_f_records form_f_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_f_records
    ADD CONSTRAINT form_f_records_pkey PRIMARY KEY (id);


--
-- Name: hr_rejoining_form_counter hr_rejoining_form_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_rejoining_form_counter
    ADD CONSTRAINT hr_rejoining_form_counter_pkey PRIMARY KEY (id);


--
-- Name: hr_rejoining_forms hr_rejoining_forms_form_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_rejoining_forms
    ADD CONSTRAINT hr_rejoining_forms_form_number_unique UNIQUE (form_number);


--
-- Name: hr_rejoining_forms hr_rejoining_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_rejoining_forms
    ADD CONSTRAINT hr_rejoining_forms_pkey PRIMARY KEY (id);


--
-- Name: inventory_consumption_rules inventory_consumption_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_consumption_rules
    ADD CONSTRAINT inventory_consumption_rules_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: kiosk_payment_sessions kiosk_payment_sessions_payment_link_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kiosk_payment_sessions
    ADD CONSTRAINT kiosk_payment_sessions_payment_link_id_key UNIQUE (payment_link_id);


--
-- Name: kiosk_payment_sessions kiosk_payment_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kiosk_payment_sessions
    ADD CONSTRAINT kiosk_payment_sessions_pkey PRIMARY KEY (id);


--
-- Name: ledgers ledgers_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_name_unique UNIQUE (name);


--
-- Name: ledgers ledgers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_pkey PRIMARY KEY (id);


--
-- Name: machine_amc_contracts machine_amc_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_amc_contracts
    ADD CONSTRAINT machine_amc_contracts_pkey PRIMARY KEY (id);


--
-- Name: machine_breakdowns machine_breakdowns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_breakdowns
    ADD CONSTRAINT machine_breakdowns_pkey PRIMARY KEY (id);


--
-- Name: machine_service_records machine_service_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_service_records
    ADD CONSTRAINT machine_service_records_pkey PRIMARY KEY (id);


--
-- Name: machines machines_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_code_unique UNIQUE (code);


--
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- Name: modalities modalities_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modalities
    ADD CONSTRAINT modalities_name_unique UNIQUE (name);


--
-- Name: modalities modalities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.modalities
    ADD CONSTRAINT modalities_pkey PRIMARY KEY (id);


--
-- Name: online_bookings online_bookings_booking_ref_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.online_bookings
    ADD CONSTRAINT online_bookings_booking_ref_unique UNIQUE (booking_ref);


--
-- Name: online_bookings online_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.online_bookings
    ADD CONSTRAINT online_bookings_pkey PRIMARY KEY (id);


--
-- Name: order_tests order_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_tests
    ADD CONSTRAINT order_tests_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: outsourced_labs outsourced_labs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outsourced_labs
    ADD CONSTRAINT outsourced_labs_pkey PRIMARY KEY (id);


--
-- Name: package_counter package_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_counter
    ADD CONSTRAINT package_counter_pkey PRIMARY KEY (id);


--
-- Name: package_tests package_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_tests
    ADD CONSTRAINT package_tests_pkey PRIMARY KEY (id);


--
-- Name: packages packages_package_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_package_code_unique UNIQUE (package_code);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: pacs_logs pacs_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pacs_logs
    ADD CONSTRAINT pacs_logs_pkey PRIMARY KEY (id);


--
-- Name: pacs_settings pacs_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pacs_settings
    ADD CONSTRAINT pacs_settings_pkey PRIMARY KEY (id);


--
-- Name: patient_counter patient_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_counter
    ADD CONSTRAINT patient_counter_pkey PRIMARY KEY (id);


--
-- Name: patient_reports patient_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_reports
    ADD CONSTRAINT patient_reports_pkey PRIMARY KEY (id);


--
-- Name: patients patients_patient_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_patient_id_unique UNIQUE (patient_id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: portal_sessions portal_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_sessions
    ADD CONSTRAINT portal_sessions_pkey PRIMARY KEY (id);


--
-- Name: portal_sessions portal_sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.portal_sessions
    ADD CONSTRAINT portal_sessions_token_unique UNIQUE (token);


--
-- Name: printer_settings printer_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.printer_settings
    ADD CONSTRAINT printer_settings_pkey PRIMARY KEY (id);


--
-- Name: radiology_audit_log radiology_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_audit_log
    ADD CONSTRAINT radiology_audit_log_pkey PRIMARY KEY (id);


--
-- Name: radiology_film_issues radiology_film_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_film_issues
    ADD CONSTRAINT radiology_film_issues_pkey PRIMARY KEY (id);


--
-- Name: radiology_prompts radiology_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_prompts
    ADD CONSTRAINT radiology_prompts_pkey PRIMARY KEY (id);


--
-- Name: radiology_report_drafts radiology_report_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_report_drafts
    ADD CONSTRAINT radiology_report_drafts_pkey PRIMARY KEY (id);


--
-- Name: radiology_report_key_images radiology_report_key_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_report_key_images
    ADD CONSTRAINT radiology_report_key_images_pkey PRIMARY KEY (id);


--
-- Name: radiology_scheduled_procedures radiology_scheduled_procedures_accession_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_scheduled_procedures
    ADD CONSTRAINT radiology_scheduled_procedures_accession_number_unique UNIQUE (accession_number);


--
-- Name: radiology_scheduled_procedures radiology_scheduled_procedures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_scheduled_procedures
    ADD CONSTRAINT radiology_scheduled_procedures_pkey PRIMARY KEY (id);


--
-- Name: radiology_share_links radiology_share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_share_links
    ADD CONSTRAINT radiology_share_links_pkey PRIMARY KEY (id);


--
-- Name: radiology_studies radiology_studies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_studies
    ADD CONSTRAINT radiology_studies_pkey PRIMARY KEY (id);


--
-- Name: radiology_voice_logs radiology_voice_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_voice_logs
    ADD CONSTRAINT radiology_voice_logs_pkey PRIMARY KEY (id);


--
-- Name: radiology_worklist radiology_worklist_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.radiology_worklist
    ADD CONSTRAINT radiology_worklist_pkey PRIMARY KEY (id);


--
-- Name: report_shares report_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_shares
    ADD CONSTRAINT report_shares_pkey PRIMARY KEY (id);


--
-- Name: report_templates report_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_name_unique UNIQUE (name);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: sample_test_assignments sample_test_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sample_test_assignments
    ADD CONSTRAINT sample_test_assignments_pkey PRIMARY KEY (id);


--
-- Name: samples samples_barcode_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_barcode_unique UNIQUE (barcode);


--
-- Name: samples samples_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_pkey PRIMARY KEY (id);


--
-- Name: signatures signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signatures
    ADD CONSTRAINT signatures_pkey PRIMARY KEY (id);


--
-- Name: site_faqs site_faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_faqs
    ADD CONSTRAINT site_faqs_pkey PRIMARY KEY (id);


--
-- Name: site_pages site_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_pages
    ADD CONSTRAINT site_pages_pkey PRIMARY KEY (id);


--
-- Name: site_photos site_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_photos
    ADD CONSTRAINT site_photos_pkey PRIMARY KEY (id);


--
-- Name: site_popups site_popups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_popups
    ADD CONSTRAINT site_popups_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: staff_advances staff_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_advances
    ADD CONSTRAINT staff_advances_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance staff_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_pkey PRIMARY KEY (id);


--
-- Name: staff_biometric_credentials staff_biometric_credentials_credential_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_biometric_credentials
    ADD CONSTRAINT staff_biometric_credentials_credential_id_unique UNIQUE (credential_id);


--
-- Name: staff_biometric_credentials staff_biometric_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_biometric_credentials
    ADD CONSTRAINT staff_biometric_credentials_pkey PRIMARY KEY (id);


--
-- Name: staff_counter staff_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_counter
    ADD CONSTRAINT staff_counter_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff_salary_payments staff_salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_salary_payments
    ADD CONSTRAINT staff_salary_payments_pkey PRIMARY KEY (id);


--
-- Name: staff staff_staff_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_staff_id_unique UNIQUE (staff_id);


--
-- Name: super_admin_sessions super_admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.super_admin_sessions
    ADD CONSTRAINT super_admin_sessions_pkey PRIMARY KEY (token);


--
-- Name: test_categories test_categories_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_categories
    ADD CONSTRAINT test_categories_name_unique UNIQUE (name);


--
-- Name: test_categories test_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_categories
    ADD CONSTRAINT test_categories_pkey PRIMARY KEY (id);


--
-- Name: test_tokens test_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test_tokens
    ADD CONSTRAINT test_tokens_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (id);


--
-- Name: user_day_closures user_day_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_day_closures
    ADD CONSTRAINT user_day_closures_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_unique UNIQUE (token);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: vendors vendors_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_code_unique UNIQUE (code);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: voucher_audits voucher_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.voucher_audits
    ADD CONSTRAINT voucher_audits_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_voucher_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_voucher_number_unique UNIQUE (voucher_number);


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_settings whatsapp_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_settings
    ADD CONSTRAINT whatsapp_settings_pkey PRIMARY KEY (id);


--
-- Name: abnormal_findings_by_modality_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX abnormal_findings_by_modality_idx ON public.abnormal_findings USING btree (modality);


--
-- Name: abnormal_findings_by_test_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX abnormal_findings_by_test_idx ON public.abnormal_findings USING btree (test_id);


--
-- Name: ai_audit_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_audit_created_idx ON public.ai_reporting_audit_logs USING btree (created_at);


--
-- Name: ai_audit_study_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_audit_study_idx ON public.ai_reporting_audit_logs USING btree (study_instance_uid);


--
-- Name: ai_audit_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_audit_user_idx ON public.ai_reporting_audit_logs USING btree (user_id);


--
-- Name: ai_draft_patient_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_draft_patient_idx ON public.ai_reporting_drafts USING btree (patient_id);


--
-- Name: ai_draft_study_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_draft_study_idx ON public.ai_reporting_drafts USING btree (study_instance_uid);


--
-- Name: amc_end_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX amc_end_date_idx ON public.machine_amc_contracts USING btree (end_date);


--
-- Name: amc_machine_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX amc_machine_idx ON public.machine_amc_contracts USING btree (machine_id);


--
-- Name: audit_runs_cron_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX audit_runs_cron_unique_idx ON public.audit_runs USING btree (period_from, period_to) WHERE (source = 'cron'::text);


--
-- Name: audit_runs_generated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_runs_generated_at_idx ON public.audit_runs USING btree (generated_at DESC);


--
-- Name: branches_one_main_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX branches_one_main_uq ON public.branches USING btree (is_main) WHERE (is_main = true);


--
-- Name: breakdown_machine_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX breakdown_machine_idx ON public.machine_breakdowns USING btree (machine_id);


--
-- Name: breakdown_reported_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX breakdown_reported_idx ON public.machine_breakdowns USING btree (reported_at);


--
-- Name: breakdown_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX breakdown_status_idx ON public.machine_breakdowns USING btree (status);


--
-- Name: day_closures_covered_to_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX day_closures_covered_to_idx ON public.day_closures USING btree (covered_to_ts);


--
-- Name: doctor_payouts_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX doctor_payouts_date_idx ON public.doctor_payouts USING btree (payment_date);


--
-- Name: doctor_payouts_doctor_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX doctor_payouts_doctor_date_idx ON public.doctor_payouts USING btree (doctor_id, payment_date);


--
-- Name: doctor_payouts_doctor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX doctor_payouts_doctor_idx ON public.doctor_payouts USING btree (doctor_id);


--
-- Name: machines_dept_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX machines_dept_idx ON public.machines USING btree (department);


--
-- Name: machines_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX machines_status_idx ON public.machines USING btree (status);


--
-- Name: patient_reports_critical_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX patient_reports_critical_idx ON public.patient_reports USING btree (is_critical);


--
-- Name: patient_reports_number_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX patient_reports_number_uq ON public.patient_reports USING btree (report_number);


--
-- Name: patient_reports_patient_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX patient_reports_patient_idx ON public.patient_reports USING btree (patient_id);


--
-- Name: patient_reports_public_token_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX patient_reports_public_token_uq ON public.patient_reports USING btree (public_token);


--
-- Name: patient_reports_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX patient_reports_status_idx ON public.patient_reports USING btree (status);


--
-- Name: portal_sessions_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX portal_sessions_token_idx ON public.portal_sessions USING btree (token);


--
-- Name: rad_key_images_draft_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rad_key_images_draft_idx ON public.radiology_report_key_images USING btree (draft_id);


--
-- Name: rad_key_images_study_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rad_key_images_study_idx ON public.radiology_report_key_images USING btree (study_id);


--
-- Name: rad_report_drafts_patient_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rad_report_drafts_patient_idx ON public.radiology_report_drafts USING btree (patient_id);


--
-- Name: rad_report_drafts_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rad_report_drafts_status_idx ON public.radiology_report_drafts USING btree (status);


--
-- Name: rad_report_drafts_study_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rad_report_drafts_study_idx ON public.radiology_report_drafts USING btree (study_id);


--
-- Name: rad_voice_logs_draft_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rad_voice_logs_draft_idx ON public.radiology_voice_logs USING btree (draft_id);


--
-- Name: radiology_audit_log_action_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_audit_log_action_idx ON public.radiology_audit_log USING btree (action);


--
-- Name: radiology_audit_log_worklist_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_audit_log_worklist_idx ON public.radiology_audit_log USING btree (worklist_id);


--
-- Name: radiology_prompts_modality_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_prompts_modality_idx ON public.radiology_prompts USING btree (modality);


--
-- Name: radiology_share_links_study_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_share_links_study_idx ON public.radiology_share_links USING btree (study_id);


--
-- Name: radiology_share_links_token_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX radiology_share_links_token_uq ON public.radiology_share_links USING btree (token);


--
-- Name: radiology_studies_accession_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX radiology_studies_accession_uq ON public.radiology_studies USING btree (accession_number);


--
-- Name: radiology_studies_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_studies_date_idx ON public.radiology_studies USING btree (study_date);


--
-- Name: radiology_studies_order_test_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX radiology_studies_order_test_uq ON public.radiology_studies USING btree (order_test_id);


--
-- Name: radiology_studies_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_studies_status_idx ON public.radiology_studies USING btree (status);


--
-- Name: radiology_worklist_accession_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX radiology_worklist_accession_uq ON public.radiology_worklist USING btree (accession_number);


--
-- Name: radiology_worklist_patient_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_worklist_patient_idx ON public.radiology_worklist USING btree (patient_id);


--
-- Name: radiology_worklist_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_worklist_status_idx ON public.radiology_worklist USING btree (status);


--
-- Name: radiology_worklist_uid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX radiology_worklist_uid_idx ON public.radiology_worklist USING btree (study_instance_uid);


--
-- Name: report_templates_by_test_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX report_templates_by_test_idx ON public.report_templates USING btree (test_id);


--
-- Name: sample_test_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX sample_test_unique_idx ON public.sample_test_assignments USING btree (sample_id, order_test_id);


--
-- Name: service_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX service_date_idx ON public.machine_service_records USING btree (service_date);


--
-- Name: service_machine_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX service_machine_idx ON public.machine_service_records USING btree (machine_id);


--
-- Name: service_next_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX service_next_due_idx ON public.machine_service_records USING btree (next_due_date);


--
-- Name: service_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX service_type_idx ON public.machine_service_records USING btree (service_type);


--
-- Name: staff_attendance_staff_date_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX staff_attendance_staff_date_uniq ON public.staff_attendance USING btree (staff_id, attendance_date);


--
-- Name: test_tokens_dept_date_no_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX test_tokens_dept_date_no_uq ON public.test_tokens USING btree (COALESCE(ledger_id, 1), token_date, department, token_no);


--
-- Name: test_tokens_order_test_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX test_tokens_order_test_uq ON public.test_tokens USING btree (order_test_id);


--
-- Name: tokens_ledger_date_no_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX tokens_ledger_date_no_uq ON public.tokens USING btree (COALESCE(ledger_id, 1), token_date, token_no);


--
-- Name: whatsapp_conv_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_conv_created_idx ON public.whatsapp_conversations USING btree (created_at);


--
-- Name: whatsapp_conv_phone_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX whatsapp_conv_phone_idx ON public.whatsapp_conversations USING btree (phone);


--
-- Name: appointments appointments_doctor_id_doctors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_doctor_id_doctors_id_fk FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: appointments appointments_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: bills bills_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: bills bills_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bills
    ADD CONSTRAINT bills_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: commission_rules commission_rules_doctor_id_doctors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_doctor_id_doctors_id_fk FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: doctor_payouts doctor_payouts_doctor_id_doctors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctor_payouts
    ADD CONSTRAINT doctor_payouts_doctor_id_doctors_id_fk FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: form_f_records form_f_records_bill_id_bills_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_f_records
    ADD CONSTRAINT form_f_records_bill_id_bills_id_fk FOREIGN KEY (bill_id) REFERENCES public.bills(id);


--
-- Name: form_f_records form_f_records_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.form_f_records
    ADD CONSTRAINT form_f_records_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: hr_rejoining_forms hr_rejoining_forms_staff_id_staff_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hr_rejoining_forms
    ADD CONSTRAINT hr_rejoining_forms_staff_id_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: inventory_consumption_rules inventory_consumption_rules_item_id_inventory_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_consumption_rules
    ADD CONSTRAINT inventory_consumption_rules_item_id_inventory_items_id_fk FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);


--
-- Name: inventory_consumption_rules inventory_consumption_rules_test_id_diagnostic_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_consumption_rules
    ADD CONSTRAINT inventory_consumption_rules_test_id_diagnostic_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.diagnostic_tests(id);


--
-- Name: inventory_items inventory_items_preferred_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_preferred_vendor_id_vendors_id_fk FOREIGN KEY (preferred_vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;


--
-- Name: inventory_transactions inventory_transactions_item_id_inventory_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_item_id_inventory_items_id_fk FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);


--
-- Name: inventory_transactions inventory_transactions_vendor_id_vendors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_vendor_id_vendors_id_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;


--
-- Name: machine_amc_contracts machine_amc_contracts_machine_id_machines_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_amc_contracts
    ADD CONSTRAINT machine_amc_contracts_machine_id_machines_id_fk FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE CASCADE;


--
-- Name: machine_breakdowns machine_breakdowns_machine_id_machines_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_breakdowns
    ADD CONSTRAINT machine_breakdowns_machine_id_machines_id_fk FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE CASCADE;


--
-- Name: machine_service_records machine_service_records_machine_id_machines_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_service_records
    ADD CONSTRAINT machine_service_records_machine_id_machines_id_fk FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE CASCADE;


--
-- Name: order_tests order_tests_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_tests
    ADD CONSTRAINT order_tests_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_tests order_tests_test_id_diagnostic_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_tests
    ADD CONSTRAINT order_tests_test_id_diagnostic_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.diagnostic_tests(id);


--
-- Name: orders orders_doctor_id_doctors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_doctor_id_doctors_id_fk FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: orders orders_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: package_tests package_tests_package_id_packages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_tests
    ADD CONSTRAINT package_tests_package_id_packages_id_fk FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: package_tests package_tests_test_id_diagnostic_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_tests
    ADD CONSTRAINT package_tests_test_id_diagnostic_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.diagnostic_tests(id);


--
-- Name: payments payments_bill_id_bills_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_bill_id_bills_id_fk FOREIGN KEY (bill_id) REFERENCES public.bills(id);


--
-- Name: rooms rooms_floor_id_floors_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_floor_id_floors_id_fk FOREIGN KEY (floor_id) REFERENCES public.floors(id) ON DELETE SET NULL;


--
-- Name: sample_test_assignments sample_test_assignments_order_test_id_order_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sample_test_assignments
    ADD CONSTRAINT sample_test_assignments_order_test_id_order_tests_id_fk FOREIGN KEY (order_test_id) REFERENCES public.order_tests(id) ON DELETE CASCADE;


--
-- Name: sample_test_assignments sample_test_assignments_sample_id_samples_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sample_test_assignments
    ADD CONSTRAINT sample_test_assignments_sample_id_samples_id_fk FOREIGN KEY (sample_id) REFERENCES public.samples(id) ON DELETE CASCADE;


--
-- Name: samples samples_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: samples samples_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: staff_advances staff_advances_staff_id_staff_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_advances
    ADD CONSTRAINT staff_advances_staff_id_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_attendance staff_attendance_staff_id_staff_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_staff_id_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_biometric_credentials staff_biometric_credentials_staff_id_staff_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_biometric_credentials
    ADD CONSTRAINT staff_biometric_credentials_staff_id_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: staff_salary_payments staff_salary_payments_staff_id_staff_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_salary_payments
    ADD CONSTRAINT staff_salary_payments_staff_id_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Do4xChrvKG9eHFkrmXJkmc64WEbPcTydHso8ABAEYl4embBUuFhrduoedysKqOD

