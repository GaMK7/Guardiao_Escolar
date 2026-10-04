-- Execute com RUN no Neon.
-- Cria ou atualiza este modelo, preservando os dados.
-- Encerra uma transação anterior com erro.
ROLLBACK;

BEGIN;
SET LOCAL search_path = pg_catalog;
-- Cria o agrupamento do banco.
CREATE SCHEMA IF NOT EXISTS guardiao_mer;

-- Guarda a classificação anônima.
CREATE TABLE IF NOT EXISTS guardiao_mer.denunciante (
    id_denunciante BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    classificacao VARCHAR(20) NOT NULL
        CHECK (classificacao IN ('professor','aluno','responsavel','funcionario'))
);
-- Guarda o acesso do administrador.
CREATE TABLE IF NOT EXISTS guardiao_mer.administrador (
    id_administrador BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE
        CHECK (email = lower(trim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    senha_hash TEXT NOT NULL
        CHECK (senha_hash ~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$'),
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);
-- Guarda denúncia, token, status e solução.
CREATE TABLE IF NOT EXISTS guardiao_mer.registro (
    id_registro BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    denunciante_id BIGINT NOT NULL UNIQUE
        REFERENCES guardiao_mer.denunciante(id_denunciante) ON DELETE RESTRICT,
    token_protocolo_hash VARCHAR(64) NOT NULL UNIQUE
        CHECK (token_protocolo_hash ~ '^[0-9a-f]{64}$'),
    tipo_ocorrencia VARCHAR(30) NOT NULL CHECK (tipo_ocorrencia IN (
        'bullying','cyberbullying','assedio','ameaca','agressao_fisica','discriminacao','outro')),
    descricao VARCHAR(2000) NOT NULL CHECK (descricao ~ '[^[:space:]]'),
    data_ocorrencia DATE NOT NULL,
    local VARCHAR(20) NOT NULL CHECK (local IN (
        'sala','corredor','patio','quadra','banheiro','refeitorio','entrada','internet','outro')),
    status VARCHAR(20) NOT NULL DEFAULT 'recebida'
        CHECK (status IN ('recebida','analise','concluida','arquivada')),
    solucao VARCHAR(800) CHECK (solucao IS NULL OR solucao ~ '[^[:space:]]'),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status NOT IN ('concluida','arquivada') OR solucao IS NOT NULL)
);
-- Confere as tabelas existentes antes de atualizar as funções.
DO $verificar$
BEGIN
    IF EXISTS (
        WITH esperado(tabela,coluna,tipo,obrigatorio,identidade,padrao) AS (VALUES
        ('administrador','id_administrador','bigint',true,'a',''),
        ('administrador','email','character varying(254)',true,'',''),
        ('administrador','senha_hash','text',true,'',''),
        ('administrador','ativo','boolean',true,'','true'),
        ('denunciante','id_denunciante','bigint',true,'a',''),
        ('denunciante','classificacao','character varying(20)',true,'',''),
        ('registro','id_registro','bigint',true,'a',''),
        ('registro','denunciante_id','bigint',true,'',''),
        ('registro','token_protocolo_hash','character varying(64)',true,'',''),
        ('registro','tipo_ocorrencia','character varying(30)',true,'',''),
        ('registro','descricao','character varying(2000)',true,'',''),
        ('registro','data_ocorrencia','date',true,'',''),
        ('registro','local','character varying(20)',true,'',''),
        ('registro','status','character varying(20)',true,'','''recebida''::character varying'),
        ('registro','solucao','character varying(800)',false,'',''),
        ('registro','criado_em','timestamp with time zone',true,'','now()')
        ), atual AS (
            SELECT c.relname::text,a.attname::text,format_type(a.atttypid,a.atttypmod),
                a.attnotnull,a.attidentity::text,COALESCE(pg_get_expr(d.adbin,d.adrelid),'')
            FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE n.nspname='guardiao_mer' AND c.relname IN ('denunciante','registro','administrador')
                AND a.attnum>0 AND NOT a.attisdropped
        )
        SELECT 1 FROM ((SELECT * FROM esperado EXCEPT SELECT * FROM atual)
            UNION ALL (SELECT * FROM atual EXCEPT SELECT * FROM esperado)) diferencas
    ) THEN
        RAISE EXCEPTION 'As tabelas existentes têm campos diferentes deste modelo. Nenhum dado foi apagado; envie esta mensagem para revisão.';
    END IF;
    IF EXISTS (
        WITH esperado(tabela,regra) AS (VALUES
        ('administrador','CHECK ((((email)::text = lower(TRIM(BOTH FROM email))) AND ((email)::text ~ ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$''::text)))'),
        ('administrador','CHECK ((senha_hash ~ ''^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$''::text))'),
        ('administrador','PRIMARY KEY (id_administrador)'),
        ('administrador','UNIQUE (email)'),
        ('denunciante','CHECK (((classificacao)::text = ANY ((ARRAY[''professor''::character varying, ''aluno''::character varying, ''responsavel''::character varying, ''funcionario''::character varying])::text[])))'),
        ('denunciante','PRIMARY KEY (id_denunciante)'),
        ('registro','CHECK ((((status)::text <> ALL ((ARRAY[''concluida''::character varying, ''arquivada''::character varying])::text[])) OR (solucao IS NOT NULL)))'),
        ('registro','CHECK (((descricao)::text ~ ''[^[:space:]]''::text))'),
        ('registro','CHECK (((local)::text = ANY ((ARRAY[''sala''::character varying, ''corredor''::character varying, ''patio''::character varying, ''quadra''::character varying, ''banheiro''::character varying, ''refeitorio''::character varying, ''entrada''::character varying, ''internet''::character varying, ''outro''::character varying])::text[])))'),
        ('registro','CHECK (((solucao IS NULL) OR ((solucao)::text ~ ''[^[:space:]]''::text)))'),
        ('registro','CHECK (((status)::text = ANY ((ARRAY[''recebida''::character varying, ''analise''::character varying, ''concluida''::character varying, ''arquivada''::character varying])::text[])))'),
        ('registro','CHECK (((tipo_ocorrencia)::text = ANY ((ARRAY[''bullying''::character varying, ''cyberbullying''::character varying, ''assedio''::character varying, ''ameaca''::character varying, ''agressao_fisica''::character varying, ''discriminacao''::character varying, ''outro''::character varying])::text[])))'),
        ('registro','CHECK (((token_protocolo_hash)::text ~ ''^[0-9a-f]{64}$''::text))'),
        ('registro','FOREIGN KEY (denunciante_id) REFERENCES guardiao_mer.denunciante(id_denunciante) ON DELETE RESTRICT'),
        ('registro','PRIMARY KEY (id_registro)'),
        ('registro','UNIQUE (denunciante_id)'),
        ('registro','UNIQUE (token_protocolo_hash)')
        ), atual AS (
            SELECT c.relname::text,pg_get_constraintdef(k.oid)
            FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='guardiao_mer' AND c.relname IN ('denunciante','registro','administrador')
                AND k.contype IN ('p','u','f','c')
        )
        SELECT 1 FROM ((SELECT * FROM esperado EXCEPT SELECT * FROM atual)
            UNION ALL (SELECT * FROM atual EXCEPT SELECT * FROM esperado)) diferencas
    ) THEN
        RAISE EXCEPTION 'As tabelas existentes têm regras diferentes deste modelo. Nenhum dado foi apagado; envie esta mensagem para revisão.';
    END IF;
END;
$verificar$;

-- Melhora as consultas.
CREATE INDEX IF NOT EXISTS registro_tipo_idx ON guardiao_mer.registro(tipo_ocorrencia);
CREATE INDEX IF NOT EXISTS registro_status_idx ON guardiao_mer.registro(status);
CREATE INDEX IF NOT EXISTS registro_data_idx ON guardiao_mer.registro(criado_em DESC);

-- Liga cada denunciante a um registro.
CREATE OR REPLACE FUNCTION guardiao_mer.exigir_registro() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM guardiao_mer.registro WHERE denunciante_id = NEW.id_denunciante) THEN
        RAISE EXCEPTION 'Cada denunciante anônimo deve ter exatamente um registro.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS denunciante_com_registro ON guardiao_mer.denunciante;
CREATE CONSTRAINT TRIGGER denunciante_com_registro
AFTER INSERT ON guardiao_mer.denunciante
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION guardiao_mer.exigir_registro();

-- Impede apagar as denúncias.
CREATE OR REPLACE FUNCTION guardiao_mer.bloquear_remocao() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
BEGIN
    RAISE EXCEPTION 'Não é permitido excluir ou esvaziar denúncias e sua classificação. Arquive o registro.' USING ERRCODE = '23514';
END;
$$;
DROP TRIGGER IF EXISTS registro_sem_delete ON guardiao_mer.registro;
CREATE TRIGGER registro_sem_delete BEFORE DELETE ON guardiao_mer.registro
FOR EACH ROW EXECUTE FUNCTION guardiao_mer.bloquear_remocao();
DROP TRIGGER IF EXISTS registro_sem_truncate ON guardiao_mer.registro;
CREATE TRIGGER registro_sem_truncate BEFORE TRUNCATE ON guardiao_mer.registro
FOR EACH STATEMENT EXECUTE FUNCTION guardiao_mer.bloquear_remocao();
DROP TRIGGER IF EXISTS denunciante_sem_delete ON guardiao_mer.denunciante;
CREATE TRIGGER denunciante_sem_delete BEFORE DELETE ON guardiao_mer.denunciante
FOR EACH ROW EXECUTE FUNCTION guardiao_mer.bloquear_remocao();
DROP TRIGGER IF EXISTS denunciante_sem_truncate ON guardiao_mer.denunciante;
CREATE TRIGGER denunciante_sem_truncate BEFORE TRUNCATE ON guardiao_mer.denunciante
FOR EACH STATEMENT EXECUTE FUNCTION guardiao_mer.bloquear_remocao();
DROP TRIGGER IF EXISTS denunciante_sem_update ON guardiao_mer.denunciante;
CREATE TRIGGER denunciante_sem_update BEFORE UPDATE ON guardiao_mer.denunciante
FOR EACH ROW EXECUTE FUNCTION guardiao_mer.bloquear_remocao();

-- Valida os dados e as mudanças de status.
CREATE OR REPLACE FUNCTION guardiao_mer.validar_registro() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'recebida' OR NEW.solucao IS NOT NULL THEN
            RAISE EXCEPTION 'Registro deve iniciar como recebida, sem solução.' USING ERRCODE = '23514';
        END IF;
        NEW.criado_em := clock_timestamp();
    ELSE
        IF NEW.id_registro IS DISTINCT FROM OLD.id_registro OR
           NEW.denunciante_id IS DISTINCT FROM OLD.denunciante_id OR
           NEW.token_protocolo_hash IS DISTINCT FROM OLD.token_protocolo_hash OR
           NEW.tipo_ocorrencia IS DISTINCT FROM OLD.tipo_ocorrencia OR
           NEW.descricao IS DISTINCT FROM OLD.descricao OR
           NEW.data_ocorrencia IS DISTINCT FROM OLD.data_ocorrencia OR
           NEW.local IS DISTINCT FROM OLD.local OR
           NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
            RAISE EXCEPTION 'Somente status e solução podem ser atualizados.' USING ERRCODE = '23514';
        END IF;
        IF NEW.status <> OLD.status AND NOT (
            (OLD.status = 'recebida' AND NEW.status = 'analise') OR
            (OLD.status = 'analise' AND NEW.status IN ('concluida','arquivada'))
        ) THEN
            RAISE EXCEPTION 'Transição de status inválida: % -> %.', OLD.status, NEW.status USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS registro_validado ON guardiao_mer.registro;
CREATE TRIGGER registro_validado BEFORE INSERT OR UPDATE ON guardiao_mer.registro
FOR EACH ROW EXECUTE FUNCTION guardiao_mer.validar_registro();

-- Cria a denúncia anônima.
CREATE OR REPLACE FUNCTION guardiao_mer.criar_registro(
    p_classificacao TEXT, p_tipo TEXT, p_descricao TEXT,
    p_data DATE, p_local TEXT, p_token_hash TEXT
) RETURNS TABLE (id_registro BIGINT, status TEXT, criado_em TIMESTAMPTZ)
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
DECLARE v_denunciante BIGINT;
BEGIN
    INSERT INTO guardiao_mer.denunciante(classificacao)
    VALUES (p_classificacao) RETURNING id_denunciante INTO v_denunciante;
    RETURN QUERY
    INSERT INTO guardiao_mer.registro AS r
        (denunciante_id, tipo_ocorrencia, descricao, data_ocorrencia, local, token_protocolo_hash)
    VALUES (v_denunciante, p_tipo, trim(p_descricao), p_data, p_local, p_token_hash)
    RETURNING r.id_registro, r.status::TEXT, r.criado_em;
END;
$$;

-- Consulta status e solução pelo hash do token.
CREATE OR REPLACE FUNCTION guardiao_mer.consultar_por_token(p_token_hash TEXT)
RETURNS TABLE (status TEXT, solucao TEXT, criado_em TIMESTAMPTZ)
LANGUAGE sql STABLE SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
    SELECT r.status::TEXT, r.solucao::TEXT, r.criado_em
    FROM guardiao_mer.registro r WHERE r.token_protocolo_hash = p_token_hash;
$$;

-- Atualiza status e solução com administrador ativo.
CREATE OR REPLACE FUNCTION guardiao_mer.atualizar_registro(
    p_registro BIGINT, p_administrador BIGINT, p_status TEXT, p_solucao TEXT
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
BEGIN
    PERFORM 1 FROM guardiao_mer.administrador
    WHERE id_administrador = p_administrador AND ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrador inexistente ou inativo.' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM guardiao_mer.registro WHERE id_registro = p_registro FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registro inexistente.' USING ERRCODE = '23514';
    END IF;
    UPDATE guardiao_mer.registro SET status = p_status,
        solucao = NULLIF(regexp_replace(p_solucao, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '') WHERE id_registro = p_registro;
END;
$$;

-- Conta denúncias por tipo e status.
CREATE OR REPLACE VIEW guardiao_mer.resumo_registros AS
SELECT tipo_ocorrencia, status, count(*) AS quantidade
FROM guardiao_mer.registro GROUP BY tipo_ocorrencia, status;

-- Restringe o acesso às contas autorizadas.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA guardiao_mer FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA guardiao_mer FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA guardiao_mer FROM PUBLIC;
REVOKE ALL ON SCHEMA guardiao_mer FROM PUBLIC;
-- Confirma as alterações.
COMMIT;
