--
-- PostgreSQL database dump
--

-- Dumped from database version 15.3 (Debian 15.3-0+deb12u1)
-- Dumped by pg_dump version 15.3 (Debian 15.3-0+deb12u1)

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
-- Name: college; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.college (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    address character varying(255) NOT NULL
);


ALTER TABLE public.college OWNER TO db_user;

--
-- Name: college_id_seq; Type: SEQUENCE; Schema: public; Owner: db_user
--

CREATE SEQUENCE public.college_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.college_id_seq OWNER TO db_user;

--
-- Name: college_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_user
--

ALTER SEQUENCE public.college_id_seq OWNED BY public.college.id;


--
-- Name: delivery_person; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.delivery_person (
    id integer NOT NULL,
    full_name character varying(255) NOT NULL,
    phone_number character varying(20) NOT NULL,
    email character varying(255),
    national_id_or_registration_number character varying(50),
    common_location text,
    transport_type character varying(50) NOT NULL,
    college_id integer NOT NULL,
    is_verified boolean DEFAULT false,
    password character varying(255) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    is_active boolean DEFAULT false,
    CONSTRAINT delivery_person_transport_type_check CHECK (((transport_type)::text = ANY ((ARRAY['foot'::character varying, 'bicycle'::character varying, 'motorcycle'::character varying, 'car'::character varying])::text[])))
);


ALTER TABLE public.delivery_person OWNER TO db_user;

--
-- Name: delivery_person_id_seq; Type: SEQUENCE; Schema: public; Owner: db_user
--

CREATE SEQUENCE public.delivery_person_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.delivery_person_id_seq OWNER TO db_user;

--
-- Name: delivery_person_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_user
--

ALTER SEQUENCE public.delivery_person_id_seq OWNED BY public.delivery_person.id;


--
-- Name: menu_item; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.menu_item (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(50) NOT NULL,
    price numeric(10,2) NOT NULL,
    is_available boolean DEFAULT true,
    image_url character varying(255),
    CONSTRAINT menu_item_category_check CHECK (((category)::text = ANY ((ARRAY['breakfast'::character varying, 'lunch'::character varying, 'dinner'::character varying, 'snacks'::character varying, 'drinks'::character varying])::text[])))
);


ALTER TABLE public.menu_item OWNER TO db_user;

--
-- Name: menu_item_id_seq; Type: SEQUENCE; Schema: public; Owner: db_user
--

CREATE SEQUENCE public.menu_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.menu_item_id_seq OWNER TO db_user;

--
-- Name: menu_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_user
--

ALTER SEQUENCE public.menu_item_id_seq OWNED BY public.menu_item.id;


--
-- Name: order_menu_item; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.order_menu_item (
    id integer NOT NULL,
    order_id integer NOT NULL,
    menu_item_id integer NOT NULL,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    CONSTRAINT order_menu_item_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.order_menu_item OWNER TO db_user;

--
-- Name: order_menu_item_id_seq; Type: SEQUENCE; Schema: public; Owner: db_user
--

CREATE SEQUENCE public.order_menu_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.order_menu_item_id_seq OWNER TO db_user;

--
-- Name: order_menu_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_user
--

ALTER SEQUENCE public.order_menu_item_id_seq OWNED BY public.order_menu_item.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    user_id integer NOT NULL,
    vendor_id integer NOT NULL,
    order_status character varying(50) NOT NULL,
    delivery_person_id integer,
    order_datetime timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    delivery_fee numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    requested_datetime timestamp without time zone,
    requested_asap boolean DEFAULT false,
    delivery_rating integer,
    vendor_rating integer,
    CONSTRAINT orders_delivery_rating_check CHECK (((delivery_rating >= 1) AND (delivery_rating <= 5))),
    CONSTRAINT orders_order_status_check CHECK (((order_status)::text = ANY ((ARRAY['pending'::character varying, 'assigned'::character varying, 'vendor_confirmed'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT orders_vendor_rating_check CHECK (((vendor_rating >= 1) AND (vendor_rating <= 5)))
);


ALTER TABLE public.orders OWNER TO db_user;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: db_user
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.orders_id_seq OWNER TO db_user;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_user
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public."user" (
    id integer NOT NULL,
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone_number character varying(20) NOT NULL,
    college_id integer NOT NULL,
    college_registration_number character varying(50) NOT NULL,
    password character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    geolocation point DEFAULT point((0)::double precision, (0)::double precision) NOT NULL,
    custom_address point NOT NULL
);


ALTER TABLE public."user" OWNER TO db_user;

--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: db_user
--

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_id_seq OWNER TO db_user;

--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_user
--

ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;


--
-- Name: vendor; Type: TABLE; Schema: public; Owner: db_user
--

CREATE TABLE public.vendor (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    owner_name character varying(255) NOT NULL,
    college_id integer NOT NULL,
    geolocation point NOT NULL,
    password character varying(255) NOT NULL,
    is_open boolean DEFAULT true
);


ALTER TABLE public.vendor OWNER TO db_user;

--
-- Name: vendor_id_seq; Type: SEQUENCE; Schema: public; Owner: db_user
--

CREATE SEQUENCE public.vendor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.vendor_id_seq OWNER TO db_user;

--
-- Name: vendor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_user
--

ALTER SEQUENCE public.vendor_id_seq OWNED BY public.vendor.id;


--
-- Name: college id; Type: DEFAULT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.college ALTER COLUMN id SET DEFAULT nextval('public.college_id_seq'::regclass);


--
-- Name: delivery_person id; Type: DEFAULT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.delivery_person ALTER COLUMN id SET DEFAULT nextval('public.delivery_person_id_seq'::regclass);


--
-- Name: menu_item id; Type: DEFAULT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.menu_item ALTER COLUMN id SET DEFAULT nextval('public.menu_item_id_seq'::regclass);


--
-- Name: order_menu_item id; Type: DEFAULT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.order_menu_item ALTER COLUMN id SET DEFAULT nextval('public.order_menu_item_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: user id; Type: DEFAULT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);


--
-- Name: vendor id; Type: DEFAULT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.vendor ALTER COLUMN id SET DEFAULT nextval('public.vendor_id_seq'::regclass);


--
-- Name: delivery_person ak1_delivery_person; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.delivery_person
    ADD CONSTRAINT ak1_delivery_person UNIQUE (email);


--
-- Name: order_menu_item ak1_order_menu_item; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.order_menu_item
    ADD CONSTRAINT ak1_order_menu_item UNIQUE (order_id, menu_item_id);


--
-- Name: user ak1_user; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT ak1_user UNIQUE (email);


--
-- Name: college pk_college; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.college
    ADD CONSTRAINT pk_college PRIMARY KEY (id);


--
-- Name: delivery_person pk_delivery_person; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.delivery_person
    ADD CONSTRAINT pk_delivery_person PRIMARY KEY (id);


--
-- Name: menu_item pk_menu_item; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.menu_item
    ADD CONSTRAINT pk_menu_item PRIMARY KEY (id);


--
-- Name: orders pk_order; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT pk_order PRIMARY KEY (id);


--
-- Name: order_menu_item pk_order_menu_item; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.order_menu_item
    ADD CONSTRAINT pk_order_menu_item PRIMARY KEY (id);


--
-- Name: user pk_user; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT pk_user PRIMARY KEY (id);


--
-- Name: vendor pk_vendor; Type: CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.vendor
    ADD CONSTRAINT pk_vendor PRIMARY KEY (id);


--
-- Name: delivery_person fk_delivery_person_2; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.delivery_person
    ADD CONSTRAINT fk_delivery_person_2 FOREIGN KEY (college_id) REFERENCES public.college(id) ON DELETE CASCADE;


--
-- Name: menu_item fk_menu_item_1; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.menu_item
    ADD CONSTRAINT fk_menu_item_1 FOREIGN KEY (vendor_id) REFERENCES public.vendor(id) ON DELETE CASCADE;


--
-- Name: orders fk_order_1; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_order_1 FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: orders fk_order_2; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_order_2 FOREIGN KEY (vendor_id) REFERENCES public.vendor(id) ON DELETE CASCADE;


--
-- Name: orders fk_order_3; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_order_3 FOREIGN KEY (delivery_person_id) REFERENCES public.delivery_person(id) ON DELETE SET NULL;


--
-- Name: order_menu_item fk_order_menu_item_2; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.order_menu_item
    ADD CONSTRAINT fk_order_menu_item_2 FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_menu_item fk_order_menu_item_3; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.order_menu_item
    ADD CONSTRAINT fk_order_menu_item_3 FOREIGN KEY (menu_item_id) REFERENCES public.menu_item(id) ON DELETE CASCADE;


--
-- Name: user fk_user_2; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT fk_user_2 FOREIGN KEY (college_id) REFERENCES public.college(id) ON DELETE CASCADE;


--
-- Name: vendor fk_vendor_1; Type: FK CONSTRAINT; Schema: public; Owner: db_user
--

ALTER TABLE ONLY public.vendor
    ADD CONSTRAINT fk_vendor_1 FOREIGN KEY (college_id) REFERENCES public.college(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO db_user;


--
-- PostgreSQL database dump complete
--

