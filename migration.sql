-- PostgreSQL database migration script

-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.order_menu_item CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.menu_item CASCADE;
DROP TABLE IF EXISTS public.delivery_person CASCADE;
DROP TABLE IF EXISTS public.vendor CASCADE;
DROP TABLE IF EXISTS public."user" CASCADE;
DROP TABLE IF EXISTS public.college CASCADE;

-- Drop sequences if they exist
DROP SEQUENCE IF EXISTS public.college_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.delivery_person_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.menu_item_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.order_menu_item_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.orders_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.user_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.vendor_id_seq CASCADE;

-- Create sequences
CREATE SEQUENCE public.college_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.delivery_person_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.menu_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.order_menu_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.vendor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Create tables
CREATE TABLE public.college (
    id integer NOT NULL DEFAULT nextval('public.college_id_seq'::regclass),
    name character varying(255) NOT NULL,
    address character varying(255) NOT NULL,
    CONSTRAINT pk_college PRIMARY KEY (id)
);

CREATE TABLE public.delivery_person (
    id integer NOT NULL DEFAULT nextval('public.delivery_person_id_seq'::regclass),
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
    CONSTRAINT pk_delivery_person PRIMARY KEY (id),
    CONSTRAINT ak1_delivery_person UNIQUE (email),
    CONSTRAINT delivery_person_transport_type_check CHECK (
    transport_type IN ('foot', 'bicycle', 'motorcycle', 'car')
)
);

CREATE TABLE public.menu_item (
    id integer NOT NULL DEFAULT nextval('public.menu_item_id_seq'::regclass),
    vendor_id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(50) NOT NULL,
    price numeric(10,2) NOT NULL,
    is_available boolean DEFAULT true,
    image_url character varying(255),
    CONSTRAINT pk_menu_item PRIMARY KEY (id),
CONSTRAINT menu_item_category_check CHECK (
    category IN ('breakfast', 'lunch', 'dinner', 'snacks', 'drinks')
)
);

CREATE TABLE public.order_menu_item (
    id integer NOT NULL DEFAULT nextval('public.order_menu_item_id_seq'::regclass),
    order_id integer NOT NULL,
    menu_item_id integer NOT NULL,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    CONSTRAINT pk_order_menu_item PRIMARY KEY (id),
    CONSTRAINT ak1_order_menu_item UNIQUE (order_id, menu_item_id),
    CONSTRAINT order_menu_item_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE public.orders (
    id integer NOT NULL DEFAULT nextval('public.orders_id_seq'::regclass),
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
    CONSTRAINT pk_order PRIMARY KEY (id),
    CONSTRAINT orders_delivery_rating_check CHECK (((delivery_rating >= 1) AND (delivery_rating <= 5))),
    CONSTRAINT orders_order_status_check CHECK (((order_status)::text = ANY ((ARRAY['pending'::character varying, 'assigned'::character varying, 'vendor_confirmed'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT orders_vendor_rating_check CHECK (((vendor_rating >= 1) AND (vendor_rating <= 5)))
);

CREATE TABLE public."user" (
    id integer NOT NULL DEFAULT nextval('public.user_id_seq'::regclass),
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone_number character varying(20) NOT NULL,
    college_id integer NOT NULL,
    college_registration_number character varying(50) NOT NULL,
    password character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    geolocation point DEFAULT point((0)::double precision, (0)::double precision) NOT NULL,
    custom_address point NOT NULL,
    CONSTRAINT pk_user PRIMARY KEY (id),
    CONSTRAINT ak1_user UNIQUE (email)
);

CREATE TABLE public.vendor (
    id integer NOT NULL DEFAULT nextval('public.vendor_id_seq'::regclass),
    name character varying(255) NOT NULL,
    owner_name character varying(255) NOT NULL,
    college_id integer NOT NULL,
    geolocation point NOT NULL,
    password character varying(255) NOT NULL,
    is_open boolean DEFAULT true,
    CONSTRAINT pk_vendor PRIMARY KEY (id)
);

-- Add foreign key constraints
ALTER TABLE ONLY public.delivery_person
    ADD CONSTRAINT fk_delivery_person_2 FOREIGN KEY (college_id) REFERENCES public.college(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_item
    ADD CONSTRAINT fk_menu_item_1 FOREIGN KEY (vendor_id) REFERENCES public.vendor(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_order_1 FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_order_2 FOREIGN KEY (vendor_id) REFERENCES public.vendor(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_order_3 FOREIGN KEY (delivery_person_id) REFERENCES public.delivery_person(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.order_menu_item
    ADD CONSTRAINT fk_order_menu_item_2 FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_menu_item
    ADD CONSTRAINT fk_order_menu_item_3 FOREIGN KEY (menu_item_id) REFERENCES public.menu_item(id) ON DELETE CASCADE;

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT fk_user_2 FOREIGN KEY (college_id) REFERENCES public.college(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vendor
    ADD CONSTRAINT fk_vendor_1 FOREIGN KEY (college_id) REFERENCES public.college(id) ON DELETE CASCADE;

-- Grant permissions
GRANT ALL ON SCHEMA public TO db_user;