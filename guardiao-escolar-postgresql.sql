-- Execute com RUN no Neon.
-- Cria ou atualiza este modelo, preservando os dados.
-- Encerra uma transação anterior com erro.
ROLLBACK;

BEGIN;
SET LOCAL search_path = pg_catalog;
-- Cria o agrupamento do banco.
CREATE SCHEMA IF NOT EXISTS guardiao_mer;

-- Guarda o vínculo do denunciante anônimo, só quando ele é informado.
CREATE TABLE IF NOT EXISTS guardiao_mer.denunciante (
    id_denunciante BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    classificacao VARCHAR(20) NOT NULL
        CHECK (classificacao IN ('professor','aluno','responsavel','funcionario','outro'))
);
-- Guarda os usuários da área da escola. Perfil "administrador" também cadastra
-- e desativa usuários (RF22); "responsavel" trata as denúncias.
CREATE TABLE IF NOT EXISTS guardiao_mer.administrador (
    id_administrador BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE
        CHECK (email = lower(trim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    senha_hash TEXT NOT NULL
        CHECK (senha_hash ~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$'),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    nome VARCHAR(100) NOT NULL CHECK (nome ~ '[^[:space:]]'),
    perfil VARCHAR(20) NOT NULL DEFAULT 'responsavel'
        CHECK (perfil IN ('administrador','responsavel')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Guarda denúncia, protocolo, token e status atual.
CREATE TABLE IF NOT EXISTS guardiao_mer.registro (
    id_registro BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    protocolo VARCHAR(20) NOT NULL UNIQUE
        CHECK (protocolo ~ '^[0-9]{4}-[0-9]{4,}$'),
    denunciante_id BIGINT UNIQUE
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
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Guarda o histórico: cada providência, com status, autor e data-hora (RF20, RN04).
CREATE TABLE IF NOT EXISTS guardiao_mer.andamento (
    id_andamento BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    registro_id BIGINT NOT NULL
        REFERENCES guardiao_mer.registro(id_registro) ON DELETE RESTRICT,
    administrador_id BIGINT NOT NULL
        REFERENCES guardiao_mer.administrador(id_administrador) ON DELETE RESTRICT,
    status_novo VARCHAR(20) NOT NULL
        CHECK (status_novo IN ('recebida','analise','concluida','arquivada')),
    providencia VARCHAR(800) NOT NULL CHECK (providencia ~ '[^[:space:]]'),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Guarda as sessões abertas no login: o navegador tem o token, o banco só o hash (RF14, RF15).
CREATE TABLE IF NOT EXISTS guardiao_mer.sessao (
    id_sessao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    administrador_id BIGINT NOT NULL
        REFERENCES guardiao_mer.administrador(id_administrador) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em TIMESTAMPTZ NOT NULL
);

-- Monta o protocolo: ano da criação (horário de Brasília) e número do registro.
CREATE OR REPLACE FUNCTION guardiao_mer.montar_protocolo(p_id BIGINT, p_criado_em TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
    SELECT to_char(p_criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY') || '-' ||
        lpad(p_id::text, greatest(4, length(p_id::text)), '0');
$$;

-- Atualiza o banco criado pela versão anterior, preservando os dados.
ALTER TABLE guardiao_mer.denunciante DROP CONSTRAINT IF EXISTS denunciante_classificacao_check;
ALTER TABLE guardiao_mer.denunciante ADD CONSTRAINT denunciante_classificacao_check
    CHECK (classificacao IN ('professor','aluno','responsavel','funcionario','outro'));
ALTER TABLE guardiao_mer.registro ALTER COLUMN denunciante_id DROP NOT NULL;
ALTER TABLE guardiao_mer.registro ADD COLUMN IF NOT EXISTS protocolo VARCHAR(20);
UPDATE guardiao_mer.registro SET protocolo = guardiao_mer.montar_protocolo(id_registro, criado_em)
    WHERE protocolo IS NULL;
ALTER TABLE guardiao_mer.registro ALTER COLUMN protocolo SET NOT NULL;
-- Usuários de antes ganham nome (a parte do e-mail antes do @, até alguém trocar) e perfil.
ALTER TABLE guardiao_mer.administrador ADD COLUMN IF NOT EXISTS nome VARCHAR(100);
UPDATE guardiao_mer.administrador SET nome = left(split_part(email, '@', 1), 100) WHERE nome IS NULL;
ALTER TABLE guardiao_mer.administrador ALTER COLUMN nome SET NOT NULL;
ALTER TABLE guardiao_mer.administrador ADD COLUMN IF NOT EXISTS perfil VARCHAR(20);
-- Quem já tinha acesso foi criado pelo npm run criar-admin, então é administrador.
UPDATE guardiao_mer.administrador SET perfil = 'administrador' WHERE perfil IS NULL;
ALTER TABLE guardiao_mer.administrador ALTER COLUMN perfil SET NOT NULL;
ALTER TABLE guardiao_mer.administrador ALTER COLUMN perfil SET DEFAULT 'responsavel';
ALTER TABLE guardiao_mer.administrador ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();
DO $migrar$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'administrador_nome_check'
                   AND conrelid = 'guardiao_mer.administrador'::regclass) THEN
        ALTER TABLE guardiao_mer.administrador ADD CONSTRAINT administrador_nome_check
            CHECK (nome ~ '[^[:space:]]');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'administrador_perfil_check'
                   AND conrelid = 'guardiao_mer.administrador'::regclass) THEN
        ALTER TABLE guardiao_mer.administrador ADD CONSTRAINT administrador_perfil_check
            CHECK (perfil IN ('administrador','responsavel'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registro_protocolo_key'
                   AND conrelid = 'guardiao_mer.registro'::regclass) THEN
        ALTER TABLE guardiao_mer.registro ADD CONSTRAINT registro_protocolo_key UNIQUE (protocolo);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registro_protocolo_check'
                   AND conrelid = 'guardiao_mer.registro'::regclass) THEN
        ALTER TABLE guardiao_mer.registro ADD CONSTRAINT registro_protocolo_check
            CHECK (protocolo ~ '^[0-9]{4}-[0-9]{4,}$');
    END IF;
    -- A coluna solucao deu lugar à tabela andamento, que guarda autor e data-hora.
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'guardiao_mer.registro'::regclass
               AND attname = 'solucao' AND NOT attisdropped) THEN
        IF EXISTS (SELECT 1 FROM guardiao_mer.registro WHERE solucao IS NOT NULL) THEN
            RAISE EXCEPTION 'Há denúncias com solução no formato antigo, sem autor nem data. Nenhum dado foi apagado; envie esta mensagem para revisão.';
        END IF;
        ALTER TABLE guardiao_mer.registro DROP COLUMN solucao;
    END IF;
END;
$migrar$;

-- Confere as tabelas existentes antes de atualizar as funções.
DO $verificar$
BEGIN
    IF EXISTS (
        WITH esperado(tabela,coluna,tipo,obrigatorio,identidade,padrao) AS (VALUES
        ('administrador','id_administrador','bigint',true,'a',''),
        ('administrador','email','character varying(254)',true,'',''),
        ('administrador','senha_hash','text',true,'',''),
        ('administrador','ativo','boolean',true,'','true'),
        ('administrador','nome','character varying(100)',true,'',''),
        ('administrador','perfil','character varying(20)',true,'','''responsavel''::character varying'),
        ('administrador','criado_em','timestamp with time zone',true,'','now()'),
        ('denunciante','id_denunciante','bigint',true,'a',''),
        ('denunciante','classificacao','character varying(20)',true,'',''),
        ('registro','id_registro','bigint',true,'a',''),
        ('registro','protocolo','character varying(20)',true,'',''),
        ('registro','denunciante_id','bigint',false,'',''),
        ('registro','token_protocolo_hash','character varying(64)',true,'',''),
        ('registro','tipo_ocorrencia','character varying(30)',true,'',''),
        ('registro','descricao','character varying(2000)',true,'',''),
        ('registro','data_ocorrencia','date',true,'',''),
        ('registro','local','character varying(20)',true,'',''),
        ('registro','status','character varying(20)',true,'','''recebida''::character varying'),
        ('registro','criado_em','timestamp with time zone',true,'','now()'),
        ('andamento','id_andamento','bigint',true,'a',''),
        ('andamento','registro_id','bigint',true,'',''),
        ('andamento','administrador_id','bigint',true,'',''),
        ('andamento','status_novo','character varying(20)',true,'',''),
        ('andamento','providencia','character varying(800)',true,'',''),
        ('andamento','criado_em','timestamp with time zone',true,'','now()'),
        ('sessao','id_sessao','bigint',true,'a',''),
        ('sessao','administrador_id','bigint',true,'',''),
        ('sessao','token_hash','character varying(64)',true,'',''),
        ('sessao','criado_em','timestamp with time zone',true,'','now()'),
        ('sessao','expira_em','timestamp with time zone',true,'','')
        ), atual AS (
            SELECT c.relname::text,a.attname::text,format_type(a.atttypid,a.atttypmod),
                a.attnotnull,a.attidentity::text,COALESCE(pg_get_expr(d.adbin,d.adrelid),'')
            FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE n.nspname='guardiao_mer' AND c.relname IN ('denunciante','registro','administrador','andamento','sessao')
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
        ('administrador','CHECK (((nome)::text ~ ''[^[:space:]]''::text))'),
        ('administrador','CHECK (((perfil)::text = ANY ((ARRAY[''administrador''::character varying, ''responsavel''::character varying])::text[])))'),
        ('administrador','PRIMARY KEY (id_administrador)'),
        ('administrador','UNIQUE (email)'),
        ('denunciante','CHECK (((classificacao)::text = ANY ((ARRAY[''professor''::character varying, ''aluno''::character varying, ''responsavel''::character varying, ''funcionario''::character varying, ''outro''::character varying])::text[])))'),
        ('denunciante','PRIMARY KEY (id_denunciante)'),
        ('registro','CHECK (((protocolo)::text ~ ''^[0-9]{4}-[0-9]{4,}$''::text))'),
        ('registro','UNIQUE (protocolo)'),
        ('registro','CHECK (((descricao)::text ~ ''[^[:space:]]''::text))'),
        ('registro','CHECK (((local)::text = ANY ((ARRAY[''sala''::character varying, ''corredor''::character varying, ''patio''::character varying, ''quadra''::character varying, ''banheiro''::character varying, ''refeitorio''::character varying, ''entrada''::character varying, ''internet''::character varying, ''outro''::character varying])::text[])))'),
        ('registro','CHECK (((status)::text = ANY ((ARRAY[''recebida''::character varying, ''analise''::character varying, ''concluida''::character varying, ''arquivada''::character varying])::text[])))'),
        ('registro','CHECK (((tipo_ocorrencia)::text = ANY ((ARRAY[''bullying''::character varying, ''cyberbullying''::character varying, ''assedio''::character varying, ''ameaca''::character varying, ''agressao_fisica''::character varying, ''discriminacao''::character varying, ''outro''::character varying])::text[])))'),
        ('registro','CHECK (((token_protocolo_hash)::text ~ ''^[0-9a-f]{64}$''::text))'),
        ('registro','FOREIGN KEY (denunciante_id) REFERENCES guardiao_mer.denunciante(id_denunciante) ON DELETE RESTRICT'),
        ('registro','PRIMARY KEY (id_registro)'),
        ('registro','UNIQUE (denunciante_id)'),
        ('registro','UNIQUE (token_protocolo_hash)'),
        ('andamento','CHECK (((providencia)::text ~ ''[^[:space:]]''::text))'),
        ('andamento','CHECK (((status_novo)::text = ANY ((ARRAY[''recebida''::character varying, ''analise''::character varying, ''concluida''::character varying, ''arquivada''::character varying])::text[])))'),
        ('andamento','FOREIGN KEY (administrador_id) REFERENCES guardiao_mer.administrador(id_administrador) ON DELETE RESTRICT'),
        ('andamento','FOREIGN KEY (registro_id) REFERENCES guardiao_mer.registro(id_registro) ON DELETE RESTRICT'),
        ('andamento','PRIMARY KEY (id_andamento)'),
        ('sessao','CHECK (((token_hash)::text ~ ''^[0-9a-f]{64}$''::text))'),
        ('sessao','FOREIGN KEY (administrador_id) REFERENCES guardiao_mer.administrador(id_administrador) ON DELETE CASCADE'),
        ('sessao','PRIMARY KEY (id_sessao)'),
        ('sessao','UNIQUE (token_hash)')
        ), atual AS (
            SELECT c.relname::text,pg_get_constraintdef(k.oid)
            FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='guardiao_mer' AND c.relname IN ('denunciante','registro','administrador','andamento','sessao')
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
CREATE INDEX IF NOT EXISTS andamento_registro_idx ON guardiao_mer.andamento(registro_id, criado_em);
CREATE INDEX IF NOT EXISTS sessao_administrador_idx ON guardiao_mer.sessao(administrador_id);

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

-- Mantém o histórico intacto: grava a data-hora do servidor e impede alterar ou apagar.
CREATE OR REPLACE FUNCTION guardiao_mer.proteger_andamento() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.criado_em := clock_timestamp();
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'O histórico de andamentos não pode ser alterado nem apagado.' USING ERRCODE = '23514';
END;
$$;
DROP TRIGGER IF EXISTS andamento_protegido ON guardiao_mer.andamento;
CREATE TRIGGER andamento_protegido BEFORE INSERT OR UPDATE OR DELETE ON guardiao_mer.andamento
FOR EACH ROW EXECUTE FUNCTION guardiao_mer.proteger_andamento();
DROP TRIGGER IF EXISTS andamento_sem_truncate ON guardiao_mer.andamento;
CREATE TRIGGER andamento_sem_truncate BEFORE TRUNCATE ON guardiao_mer.andamento
FOR EACH STATEMENT EXECUTE FUNCTION guardiao_mer.proteger_andamento();

-- Caminho do status (RF19): recebida -> analise -> concluida ou arquivada.
CREATE OR REPLACE FUNCTION guardiao_mer.transicao_permitida(p_de TEXT, p_para TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
    SELECT (p_de = 'recebida' AND p_para = 'analise') OR
           (p_de = 'analise' AND p_para IN ('concluida','arquivada'));
$$;

-- Valida os dados e as mudanças de status.
CREATE OR REPLACE FUNCTION guardiao_mer.validar_registro() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'recebida' THEN
            RAISE EXCEPTION 'Registro deve iniciar como recebida.' USING ERRCODE = '23514';
        END IF;
        NEW.criado_em := clock_timestamp();
        NEW.protocolo := guardiao_mer.montar_protocolo(NEW.id_registro, NEW.criado_em);
    ELSE
        IF NEW.id_registro IS DISTINCT FROM OLD.id_registro OR
           NEW.protocolo IS DISTINCT FROM OLD.protocolo OR
           NEW.denunciante_id IS DISTINCT FROM OLD.denunciante_id OR
           NEW.token_protocolo_hash IS DISTINCT FROM OLD.token_protocolo_hash OR
           NEW.tipo_ocorrencia IS DISTINCT FROM OLD.tipo_ocorrencia OR
           NEW.descricao IS DISTINCT FROM OLD.descricao OR
           NEW.data_ocorrencia IS DISTINCT FROM OLD.data_ocorrencia OR
           NEW.local IS DISTINCT FROM OLD.local OR
           NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
            RAISE EXCEPTION 'Somente o status pode ser atualizado.' USING ERRCODE = '23514';
        END IF;
        IF NEW.status <> OLD.status AND NOT guardiao_mer.transicao_permitida(OLD.status, NEW.status) THEN
            RAISE EXCEPTION 'Transição de status inválida: % -> %.', OLD.status, NEW.status USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS registro_validado ON guardiao_mer.registro;
CREATE TRIGGER registro_validado BEFORE INSERT OR UPDATE ON guardiao_mer.registro
FOR EACH ROW EXECUTE FUNCTION guardiao_mer.validar_registro();

-- Cria a denúncia anônima; o vínculo (p_classificacao) é opcional.
-- O retorno ganhou o protocolo, por isso a versão anterior é removida antes.
DROP FUNCTION IF EXISTS guardiao_mer.criar_registro(TEXT, TEXT, TEXT, DATE, TEXT, TEXT);
CREATE FUNCTION guardiao_mer.criar_registro(
    p_classificacao TEXT, p_tipo TEXT, p_descricao TEXT,
    p_data DATE, p_local TEXT, p_token_hash TEXT
) RETURNS TABLE (id_registro BIGINT, protocolo TEXT, status TEXT, criado_em TIMESTAMPTZ)
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
DECLARE v_denunciante BIGINT;
BEGIN
    IF NULLIF(trim(p_classificacao), '') IS NOT NULL THEN
        INSERT INTO guardiao_mer.denunciante(classificacao)
        VALUES (trim(p_classificacao)) RETURNING id_denunciante INTO v_denunciante;
    END IF;
    RETURN QUERY
    INSERT INTO guardiao_mer.registro AS r
        (denunciante_id, tipo_ocorrencia, descricao, data_ocorrencia, local, token_protocolo_hash)
    VALUES (v_denunciante, p_tipo, trim(p_descricao), p_data, p_local, p_token_hash)
    RETURNING r.id_registro, r.protocolo::TEXT, r.status::TEXT, r.criado_em;
END;
$$;

-- Consulta pública pelo hash do token (RF11, RF12): uma linha por andamento.
-- Não devolve relato, local, vínculo nem autor, para não identificar ninguém (RF13).
DROP FUNCTION IF EXISTS guardiao_mer.consultar_por_token(TEXT);
CREATE FUNCTION guardiao_mer.consultar_por_token(p_token_hash TEXT)
RETURNS TABLE (protocolo TEXT, tipo TEXT, status TEXT, criado_em TIMESTAMPTZ,
               andamento_status TEXT, andamento_providencia TEXT, andamento_em TIMESTAMPTZ)
LANGUAGE sql STABLE SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
    SELECT r.protocolo::TEXT, r.tipo_ocorrencia::TEXT, r.status::TEXT, r.criado_em,
           a.status_novo::TEXT, a.providencia::TEXT, a.criado_em
    FROM guardiao_mer.registro r
    LEFT JOIN guardiao_mer.andamento a ON a.registro_id = r.id_registro
    WHERE r.token_protocolo_hash = p_token_hash
    ORDER BY a.criado_em, a.id_andamento;
$$;

-- Detalhe completo para a escola (RF18): uma linha por andamento, com o nome do autor.
CREATE OR REPLACE FUNCTION guardiao_mer.detalhar_registro(p_protocolo TEXT)
RETURNS TABLE (protocolo TEXT, tipo TEXT, status TEXT, descricao TEXT, data_ocorrencia TEXT,
               local TEXT, vinculo TEXT, criado_em TIMESTAMPTZ, andamento_status TEXT,
               andamento_providencia TEXT, andamento_em TIMESTAMPTZ, andamento_autor TEXT)
LANGUAGE sql STABLE SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
    SELECT r.protocolo::TEXT, r.tipo_ocorrencia::TEXT, r.status::TEXT, r.descricao::TEXT,
           to_char(r.data_ocorrencia, 'YYYY-MM-DD'), r.local::TEXT, d.classificacao::TEXT, r.criado_em,
           a.status_novo::TEXT, a.providencia::TEXT, a.criado_em, adm.nome::TEXT
    FROM guardiao_mer.registro r
    LEFT JOIN guardiao_mer.denunciante d ON d.id_denunciante = r.denunciante_id
    LEFT JOIN guardiao_mer.andamento a ON a.registro_id = r.id_registro
    LEFT JOIN guardiao_mer.administrador adm ON adm.id_administrador = a.administrador_id
    WHERE r.protocolo = p_protocolo
    ORDER BY a.criado_em, a.id_andamento;
$$;

-- Registra uma providência e, se o status mudar, atualiza a denúncia (RF19, RF20, RN04).
-- Sem linhas no retorno: protocolo inexistente. Erro 42501: administrador inativo.
-- Erro 55000: mudança de status fora do caminho permitido.
DROP FUNCTION IF EXISTS guardiao_mer.atualizar_registro(BIGINT, BIGINT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION guardiao_mer.registrar_andamento(
    p_protocolo TEXT, p_administrador BIGINT, p_status TEXT, p_providencia TEXT
) RETURNS TABLE (status TEXT, providencia TEXT, criado_em TIMESTAMPTZ, autor TEXT)
LANGUAGE plpgsql SET search_path = pg_catalog, guardiao_mer, pg_temp AS $$
DECLARE v_registro BIGINT; v_status TEXT; v_autor TEXT;
BEGIN
    SELECT adm.nome INTO v_autor FROM guardiao_mer.administrador adm
    WHERE adm.id_administrador = p_administrador AND adm.ativo;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Administrador inexistente ou inativo.' USING ERRCODE = '42501';
    END IF;
    SELECT r.id_registro, r.status INTO v_registro, v_status
    FROM guardiao_mer.registro r WHERE r.protocolo = p_protocolo FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    IF p_status <> v_status THEN
        IF NOT guardiao_mer.transicao_permitida(v_status, p_status) THEN
            RAISE EXCEPTION 'Transição de status inválida: % -> %.', v_status, p_status USING ERRCODE = '55000';
        END IF;
        UPDATE guardiao_mer.registro r SET status = p_status WHERE r.id_registro = v_registro;
    END IF;
    RETURN QUERY
    INSERT INTO guardiao_mer.andamento AS a (registro_id, administrador_id, status_novo, providencia)
    VALUES (v_registro, p_administrador, p_status, trim(p_providencia))
    RETURNING a.status_novo::TEXT, a.providencia::TEXT, a.criado_em, v_autor;
END;
$$;

-- Conta denúncias por tipo e status (RF21).
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
