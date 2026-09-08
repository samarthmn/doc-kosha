export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  auth: {
    Tables: {
      audit_log_entries: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          ip_address: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Relationships: []
      }
      custom_oauth_providers: {
        Row: {
          acceptable_client_ids: string[]
          attribute_mapping: Json
          authorization_params: Json
          authorization_url: string | null
          cached_discovery: Json | null
          client_id: string
          client_secret: string
          created_at: string
          custom_claims_allowlist: string[]
          discovery_cached_at: string | null
          discovery_url: string | null
          email_optional: boolean
          enabled: boolean
          id: string
          identifier: string
          issuer: string | null
          jwks_uri: string | null
          name: string
          pkce_enabled: boolean
          provider_type: string
          scopes: string[]
          skip_nonce_check: boolean
          token_url: string | null
          updated_at: string
          userinfo_url: string | null
        }
        Insert: {
          acceptable_client_ids?: string[]
          attribute_mapping?: Json
          authorization_params?: Json
          authorization_url?: string | null
          cached_discovery?: Json | null
          client_id: string
          client_secret: string
          created_at?: string
          custom_claims_allowlist?: string[]
          discovery_cached_at?: string | null
          discovery_url?: string | null
          email_optional?: boolean
          enabled?: boolean
          id?: string
          identifier: string
          issuer?: string | null
          jwks_uri?: string | null
          name: string
          pkce_enabled?: boolean
          provider_type: string
          scopes?: string[]
          skip_nonce_check?: boolean
          token_url?: string | null
          updated_at?: string
          userinfo_url?: string | null
        }
        Update: {
          acceptable_client_ids?: string[]
          attribute_mapping?: Json
          authorization_params?: Json
          authorization_url?: string | null
          cached_discovery?: Json | null
          client_id?: string
          client_secret?: string
          created_at?: string
          custom_claims_allowlist?: string[]
          discovery_cached_at?: string | null
          discovery_url?: string | null
          email_optional?: boolean
          enabled?: boolean
          id?: string
          identifier?: string
          issuer?: string | null
          jwks_uri?: string | null
          name?: string
          pkce_enabled?: boolean
          provider_type?: string
          scopes?: string[]
          skip_nonce_check?: boolean
          token_url?: string | null
          updated_at?: string
          userinfo_url?: string | null
        }
        Relationships: []
      }
      flow_state: {
        Row: {
          auth_code: string | null
          auth_code_issued_at: string | null
          authentication_method: string
          code_challenge: string | null
          code_challenge_method:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at: string | null
          email_optional: boolean
          id: string
          invite_token: string | null
          linking_target_id: string | null
          oauth_client_state_id: string | null
          provider_access_token: string | null
          provider_refresh_token: string | null
          provider_type: string
          referrer: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_code?: string | null
          auth_code_issued_at?: string | null
          authentication_method: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string | null
          email_optional?: boolean
          id: string
          invite_token?: string | null
          linking_target_id?: string | null
          oauth_client_state_id?: string | null
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type: string
          referrer?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_code?: string | null
          auth_code_issued_at?: string | null
          authentication_method?: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string | null
          email_optional?: boolean
          id?: string
          invite_token?: string | null
          linking_target_id?: string | null
          oauth_client_state_id?: string | null
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type?: string
          referrer?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data: Json
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          created_at: string | null
          id: string
          raw_base_config: string | null
          updated_at: string | null
          uuid: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      mfa_amr_claims: {
        Row: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Update: {
          authentication_method?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_amr_claims_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_challenges: {
        Row: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code: string | null
          verified_at: string | null
          web_authn_session_data: Json | null
        }
        Insert: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Update: {
          created_at?: string
          factor_id?: string
          id?: string
          ip_address?: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_challenges_auth_factor_id_fkey"
            columns: ["factor_id"]
            isOneToOne: false
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_factors: {
        Row: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name: string | null
          id: string
          last_challenged_at: string | null
          last_webauthn_challenge_data: Json | null
          phone: string | null
          secret: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid: string | null
          web_authn_credential: Json | null
        }
        Insert: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Update: {
          created_at?: string
          factor_type?: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id?: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status?: Database["auth"]["Enums"]["factor_status"]
          updated_at?: string
          user_id?: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_authorizations: {
        Row: {
          approved_at: string | null
          authorization_code: string | null
          authorization_id: string
          client_id: string
          code_challenge: string | null
          code_challenge_method:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at: string
          expires_at: string
          id: string
          nonce: string | null
          redirect_uri: string
          resource: string | null
          response_type: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state: string | null
          status: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id: string
          client_id: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id: string
          nonce?: string | null
          redirect_uri: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id?: string
          client_id?: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string | null
          redirect_uri?: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope?: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_client_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          id: string
          provider_type: string
        }
        Insert: {
          code_verifier?: string | null
          created_at: string
          id: string
          provider_type: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          id?: string
          provider_type?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          client_name: string | null
          client_secret_hash: string | null
          client_type: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri: string | null
          created_at: string
          deleted_at: string | null
          grant_types: string
          id: string
          logo_uri: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types: string
          id: string
          logo_uri?: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types?: string
          id?: string
          logo_uri?: string | null
          redirect_uris?: string
          registration_type?: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_consents: {
        Row: {
          client_id: string
          granted_at: string
          id: string
          revoked_at: string | null
          scopes: string
          user_id: string
        }
        Insert: {
          client_id: string
          granted_at?: string
          id: string
          revoked_at?: string | null
          scopes: string
          user_id: string
        }
        Update: {
          client_id?: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scopes?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      one_time_tokens: {
        Row: {
          created_at: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relates_to?: string
          token_hash?: string
          token_type?: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string | null
          id: number
          instance_id: string | null
          parent: string | null
          revoked: boolean | null
          session_id: string | null
          token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_providers: {
        Row: {
          attribute_mapping: Json | null
          created_at: string | null
          entity_id: string
          id: string
          metadata_url: string | null
          metadata_xml: string
          name_id_format: string | null
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id: string
          id: string
          metadata_url?: string | null
          metadata_xml: string
          name_id_format?: string | null
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id?: string
          id?: string
          metadata_url?: string | null
          metadata_xml?: string
          name_id_format?: string | null
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_providers_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_relay_states: {
        Row: {
          created_at: string | null
          flow_state_id: string | null
          for_email: string | null
          id: string
          redirect_to: string | null
          request_id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id: string
          redirect_to?: string | null
          request_id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id?: string
          redirect_to?: string | null
          request_id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_relay_states_flow_state_id_fkey"
            columns: ["flow_state_id"]
            isOneToOne: false
            referencedRelation: "flow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saml_relay_states_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          aal: Database["auth"]["Enums"]["aal_level"] | null
          created_at: string | null
          factor_id: string | null
          id: string
          ip: unknown
          not_after: string | null
          oauth_client_id: string | null
          refresh_token_counter: number | null
          refresh_token_hmac_key: string | null
          refreshed_at: string | null
          scopes: string | null
          tag: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          scopes?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id?: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          scopes?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_oauth_client_id_fkey"
            columns: ["oauth_client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_domains_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_providers: {
        Row: {
          created_at: string | null
          disabled: boolean | null
          id: string
          resource_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          disabled?: boolean | null
          id: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          disabled?: boolean | null
          id?: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge_type: string
          created_at: string
          expires_at: string
          id: string
          session_data: Json
          user_id: string | null
        }
        Insert: {
          challenge_type: string
          created_at?: string
          expires_at: string
          id?: string
          session_data: Json
          user_id?: string | null
        }
        Update: {
          challenge_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_data?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_credentials: {
        Row: {
          aaguid: string | null
          attestation_type: string
          backed_up: boolean
          backup_eligible: boolean
          created_at: string
          credential_id: string
          friendly_name: string
          id: string
          last_used_at: string | null
          public_key: string
          sign_count: number
          transports: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          attestation_type?: string
          backed_up?: boolean
          backup_eligible?: boolean
          created_at?: string
          credential_id: string
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          sign_count?: number
          transports?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          aaguid?: string | null
          attestation_type?: string
          backed_up?: boolean
          backup_eligible?: boolean
          created_at?: string
          credential_id?: string
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          sign_count?: number
          transports?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      email: { Args: never; Returns: string }
      jwt: { Args: never; Returns: Json }
      role: { Args: never; Returns: string }
      uid: { Args: never; Returns: string }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn" | "phone"
      oauth_authorization_status: "pending" | "approved" | "denied" | "expired"
      oauth_client_type: "public" | "confidential"
      oauth_registration_type: "dynamic" | "manual"
      oauth_response_type: "code"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analytics_document_country_views: {
        Row: {
          country_code: string
          total_views: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          country_code: string
          total_views?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          country_code?: string
          total_views?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_document_country_views_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_document_pages: {
        Row: {
          created_at: string
          document_id: string
          id: string
          link_id: string
          page_number: number
          total_page_views: number
          total_time_ms: number
          unique_viewers: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          link_id: string
          page_number: number
          total_page_views?: number
          total_time_ms?: number
          unique_viewers?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          link_id?: string
          page_number?: number
          total_page_views?: number
          total_time_ms?: number
          unique_viewers?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_document_pages_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_document_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_link_country_views: {
        Row: {
          country_code: string
          link_id: string
          total_views: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          country_code: string
          link_id: string
          total_views?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          country_code?: string
          link_id?: string
          total_views?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_link_country_views_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_link_country_views_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_media_sections: {
        Row: {
          created_at: string
          document_id: string
          id: string
          link_id: string
          section_offset: number
          total_time_ms: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          link_id: string
          section_offset: number
          total_time_ms?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          link_id?: string
          section_offset?: number
          total_time_ms?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_media_sections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_media_sections_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_media_sections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_resource_viewers: {
        Row: {
          anonymous_user_id: string | null
          document_id: string | null
          download_count: number
          first_seen_at: string
          id: string
          last_seen_at: string
          last_session_id: string | null
          link_id: string
          resource_category: Database["public"]["Enums"]["analytics_resource_category"]
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_time_ms: number
          view_count: number
          viewer_email: string | null
          viewer_key: string
          workspace_id: string
        }
        Insert: {
          anonymous_user_id?: string | null
          document_id?: string | null
          download_count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          last_session_id?: string | null
          link_id: string
          resource_category: Database["public"]["Enums"]["analytics_resource_category"]
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_time_ms?: number
          view_count?: number
          viewer_email?: string | null
          viewer_key: string
          workspace_id: string
        }
        Update: {
          anonymous_user_id?: string | null
          document_id?: string | null
          download_count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          last_session_id?: string | null
          link_id?: string
          resource_category?: Database["public"]["Enums"]["analytics_resource_category"]
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          total_time_ms?: number
          view_count?: number
          viewer_email?: string | null
          viewer_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_resource_viewers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_resource_viewers_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_resource_viewers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_resources: {
        Row: {
          created_at: string
          document_id: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          link_id: string
          resource_category: Database["public"]["Enums"]["analytics_resource_category"]
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_downloads: number
          total_page_views: number
          total_revisits: number
          total_time_ms: number
          total_views: number
          unique_viewers: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          link_id: string
          resource_category: Database["public"]["Enums"]["analytics_resource_category"]
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_downloads?: number
          total_page_views?: number
          total_revisits?: number
          total_time_ms?: number
          total_views?: number
          unique_viewers?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          link_id?: string
          resource_category?: Database["public"]["Enums"]["analytics_resource_category"]
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          total_downloads?: number
          total_page_views?: number
          total_revisits?: number
          total_time_ms?: number
          total_views?: number
          unique_viewers?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_resources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_resources_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_resources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_session_pages: {
        Row: {
          created_at: string
          document_id: string
          id: string
          link_id: string
          page_number: number
          session_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          link_id: string
          page_number: number
          session_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          link_id?: string
          page_number?: number
          session_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_session_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_session_pages_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_session_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_v2_document_country_daily: {
        Row: {
          content_path: string
          country_code: string
          day: string
          document_id: string
          total_views: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_path: string
          country_code: string
          day: string
          document_id: string
          total_views?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_path?: string
          country_code?: string
          day?: string
          document_id?: string
          total_views?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_document_pages_daily: {
        Row: {
          content_path: string
          created_at: string
          day: string
          document_id: string
          link_id: string
          page_number: number
          total_page_views: number
          total_time_ms: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_path: string
          created_at?: string
          day: string
          document_id: string
          link_id: string
          page_number: number
          total_page_views?: number
          total_time_ms?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_path?: string
          created_at?: string
          day?: string
          document_id?: string
          link_id?: string
          page_number?: number
          total_page_views?: number
          total_time_ms?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_link_country_daily: {
        Row: {
          content_path: string
          country_code: string
          day: string
          link_id: string
          total_views: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_path: string
          country_code: string
          day: string
          link_id: string
          total_views?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_path?: string
          country_code?: string
          day?: string
          link_id?: string
          total_views?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_media_sections_daily: {
        Row: {
          content_path: string
          created_at: string
          day: string
          document_id: string
          link_id: string
          section_offset: number
          total_time_ms: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_path: string
          created_at?: string
          day: string
          document_id: string
          link_id: string
          section_offset: number
          total_time_ms?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_path?: string
          created_at?: string
          day?: string
          document_id?: string
          link_id?: string
          section_offset?: number
          total_time_ms?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_resource_viewers_daily: {
        Row: {
          anonymous_user_id: string | null
          content_path: string
          created_at: string
          day: string
          document_id: string | null
          download_count: number
          last_seen_at: string
          link_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_time_ms: number
          updated_at: string
          view_count: number
          viewer_email: string | null
          viewer_key: string
          workspace_id: string
        }
        Insert: {
          anonymous_user_id?: string | null
          content_path: string
          created_at?: string
          day: string
          document_id?: string | null
          download_count?: number
          last_seen_at?: string
          link_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_time_ms?: number
          updated_at?: string
          view_count?: number
          viewer_email?: string | null
          viewer_key: string
          workspace_id: string
        }
        Update: {
          anonymous_user_id?: string | null
          content_path?: string
          created_at?: string
          day?: string
          document_id?: string | null
          download_count?: number
          last_seen_at?: string
          link_id?: string
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          total_time_ms?: number
          updated_at?: string
          view_count?: number
          viewer_email?: string | null
          viewer_key?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_resources_daily: {
        Row: {
          content_path: string
          created_at: string
          day: string
          document_id: string | null
          first_viewed_at: string | null
          last_seen_at: string | null
          link_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_downloads: number
          total_page_views: number
          total_time_ms: number
          total_views: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_path: string
          created_at?: string
          day: string
          document_id?: string | null
          first_viewed_at?: string | null
          last_seen_at?: string | null
          link_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_downloads?: number
          total_page_views?: number
          total_time_ms?: number
          total_views?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_path?: string
          created_at?: string
          day?: string
          document_id?: string | null
          first_viewed_at?: string | null
          last_seen_at?: string | null
          link_id?: string
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          total_downloads?: number
          total_page_views?: number
          total_time_ms?: number
          total_views?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_session_pages_daily: {
        Row: {
          content_path: string
          created_at: string
          day: string
          document_id: string
          link_id: string
          page_number: number
          session_id: string
          workspace_id: string
        }
        Insert: {
          content_path: string
          created_at?: string
          day: string
          document_id: string
          link_id: string
          page_number: number
          session_id: string
          workspace_id: string
        }
        Update: {
          content_path?: string
          created_at?: string
          day?: string
          document_id?: string
          link_id?: string
          page_number?: number
          session_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_viewer_pages_daily: {
        Row: {
          content_path: string
          created_at: string
          day: string
          document_id: string
          last_seen_at: string
          link_id: string
          page_number: number
          total_time_ms: number
          updated_at: string
          view_count: number
          viewer_email: string | null
          viewer_key: string
          workspace_id: string
        }
        Insert: {
          content_path: string
          created_at?: string
          day: string
          document_id: string
          last_seen_at?: string
          link_id: string
          page_number: number
          total_time_ms?: number
          updated_at?: string
          view_count?: number
          viewer_email?: string | null
          viewer_key: string
          workspace_id: string
        }
        Update: {
          content_path?: string
          created_at?: string
          day?: string
          document_id?: string
          last_seen_at?: string
          link_id?: string
          page_number?: number
          total_time_ms?: number
          updated_at?: string
          view_count?: number
          viewer_email?: string | null
          viewer_key?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_v2_viewer_state: {
        Row: {
          anonymous_user_id: string | null
          first_seen_at: string
          last_seen_at: string
          link_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          view_count: number
          viewer_email: string | null
          viewer_key: string
          workspace_id: string
        }
        Insert: {
          anonymous_user_id?: string | null
          first_seen_at?: string
          last_seen_at?: string
          link_id: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          view_count?: number
          viewer_email?: string | null
          viewer_key: string
          workspace_id: string
        }
        Update: {
          anonymous_user_id?: string | null
          first_seen_at?: string
          last_seen_at?: string
          link_id?: string
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          view_count?: number
          viewer_email?: string | null
          viewer_key?: string
          workspace_id?: string
        }
        Relationships: []
      }
      analytics_viewer_pages: {
        Row: {
          document_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          link_id: string
          page_number: number
          total_time_ms: number
          view_count: number
          viewer_key: string
          workspace_id: string
        }
        Insert: {
          document_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          link_id: string
          page_number: number
          total_time_ms?: number
          view_count?: number
          viewer_key: string
          workspace_id: string
        }
        Update: {
          document_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          link_id?: string
          page_number?: number
          total_time_ms?: number
          view_count?: number
          viewer_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_viewer_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_viewer_pages_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_viewer_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_email: string | null
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          data_room_id: string | null
          document_id: string | null
          event_type: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string
          workspace_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          data_room_id?: string | null
          document_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type: string
          workspace_id: string
        }
        Update: {
          actor_email?: string | null
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          data_room_id?: string | null
          document_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_offers: {
        Row: {
          amount_off: number | null
          audience: string
          badge_text: string | null
          billing_interval: string | null
          created_at: string
          currency: string | null
          duration: string
          duration_in_months: number | null
          ends_at: string | null
          id: string
          name: string
          percent_off: number | null
          plan_id: string | null
          priority: number
          starts_at: string
          status: string
          stripe_coupon_id: string | null
          stripe_discount_source: string
          stripe_mode: string
          stripe_promotion_code_id: string | null
          updated_at: string
        }
        Insert: {
          amount_off?: number | null
          audience?: string
          badge_text?: string | null
          billing_interval?: string | null
          created_at?: string
          currency?: string | null
          duration: string
          duration_in_months?: number | null
          ends_at?: string | null
          id?: string
          name: string
          percent_off?: number | null
          plan_id?: string | null
          priority?: number
          starts_at?: string
          status: string
          stripe_coupon_id?: string | null
          stripe_discount_source: string
          stripe_mode: string
          stripe_promotion_code_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_off?: number | null
          audience?: string
          badge_text?: string | null
          billing_interval?: string | null
          created_at?: string
          currency?: string | null
          duration?: string
          duration_in_months?: number | null
          ends_at?: string | null
          id?: string
          name?: string
          percent_off?: number | null
          plan_id?: string | null
          priority?: number
          starts_at?: string
          status?: string
          stripe_coupon_id?: string | null
          stripe_discount_source?: string
          stripe_mode?: string
          stripe_promotion_code_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      branding: {
        Row: {
          company_name: string | null
          logo_storage_path: string | null
          updated_at: string
          watermark_color: string | null
          watermark_font_size: number | null
          watermark_opacity: number | null
          watermark_title: string | null
          website_url: string | null
          workspace_id: string
        }
        Insert: {
          company_name?: string | null
          logo_storage_path?: string | null
          updated_at?: string
          watermark_color?: string | null
          watermark_font_size?: number | null
          watermark_opacity?: number | null
          watermark_title?: string | null
          website_url?: string | null
          workspace_id: string
        }
        Update: {
          company_name?: string | null
          logo_storage_path?: string | null
          updated_at?: string
          watermark_color?: string | null
          watermark_font_size?: number | null
          watermark_opacity?: number | null
          watermark_title?: string | null
          website_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_messages: {
        Row: {
          author_color: string
          author_email: string | null
          author_key: string
          author_label: string
          author_type: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          link_id: string
          state: string
          thread_id: string
          workspace_id: string
        }
        Insert: {
          author_color: string
          author_email?: string | null
          author_key: string
          author_label: string
          author_type: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          link_id: string
          state?: string
          thread_id: string
          workspace_id: string
        }
        Update: {
          author_color?: string
          author_email?: string | null
          author_key?: string
          author_label?: string
          author_type?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          link_id?: string
          state?: string
          thread_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_messages_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "comment_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_threads: {
        Row: {
          anchor: Json
          created_at: string
          document_id: string
          id: string
          link_id: string
          page_number: number
          resolved_at: string | null
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          anchor: Json
          created_at?: string
          document_id: string
          id?: string
          link_id: string
          page_number: number
          resolved_at?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          anchor?: Json
          created_at?: string
          document_id?: string
          id?: string
          link_id?: string
          page_number?: number
          resolved_at?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_threads_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_threads_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_domains: {
        Row: {
          cname_target: string | null
          created_at: string
          domain: string
          id: string
          status: string
          updated_at: string
          verification_token: string
          verified_at: string | null
          workspace_id: string
        }
        Insert: {
          cname_target?: string | null
          created_at?: string
          domain: string
          id?: string
          status?: string
          updated_at?: string
          verification_token: string
          verified_at?: string | null
          workspace_id: string
        }
        Update: {
          cname_target?: string | null
          created_at?: string
          domain?: string
          id?: string
          status?: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_domains_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_documents: {
        Row: {
          data_room_id: string
          document_id: string
          workspace_id: string | null
        }
        Insert: {
          data_room_id: string
          document_id: string
          workspace_id?: string | null
        }
        Update: {
          data_room_id?: string
          document_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_room_documents_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_members: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"]
          created_at: string
          created_by: string | null
          data_room_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"]
          created_at?: string
          created_by?: string | null
          data_room_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"]
          created_at?: string
          created_by?: string | null
          data_room_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_room_members_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_members_room_workspace_fkey"
            columns: ["data_room_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "data_room_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      data_rooms: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_disabled: boolean
          name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_disabled?: boolean
          name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_disabled?: boolean
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_rooms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_artifact_candidates: {
        Row: {
          artifact_kind: string
          candidate_token: string
          cleaned_at: string | null
          cleanup_error: string | null
          deletion_claim_token: string | null
          document_id: string
          logical_bucket: string
          nda_signature_id: string | null
          phase: string
          producer_token: string
          published_at: string | null
          registered_at: string
          source_storage_path: string | null
          storage_path: string
          updated_at: string
          upload_finished_at: string | null
          upload_started_at: string | null
          workspace_id: string
        }
        Insert: {
          artifact_kind: string
          candidate_token: string
          cleaned_at?: string | null
          cleanup_error?: string | null
          deletion_claim_token?: string | null
          document_id: string
          logical_bucket: string
          nda_signature_id?: string | null
          phase: string
          producer_token: string
          published_at?: string | null
          registered_at?: string
          source_storage_path?: string | null
          storage_path: string
          updated_at?: string
          upload_finished_at?: string | null
          upload_started_at?: string | null
          workspace_id: string
        }
        Update: {
          artifact_kind?: string
          candidate_token?: string
          cleaned_at?: string | null
          cleanup_error?: string | null
          deletion_claim_token?: string | null
          document_id?: string
          logical_bucket?: string
          nda_signature_id?: string | null
          phase?: string
          producer_token?: string
          published_at?: string | null
          registered_at?: string
          source_storage_path?: string | null
          storage_path?: string
          updated_at?: string
          upload_finished_at?: string | null
          upload_started_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      document_deletion_claims: {
        Row: {
          claim_token: string
          completed_at: string | null
          created_at: string
          data_room_id: string | null
          deleted_document_ids: string[] | null
          deleted_folder_ids: string[] | null
          document_ids: string[]
          explicit_document_ids: string[]
          explicit_folder_ids: string[]
          finalized_by: string | null
          folder_ids: string[]
          initiated_by: string
          objects: Json
          prefixes: Json
          processing_candidates: Json
          status: string
          workspace_id: string
        }
        Insert: {
          claim_token?: string
          completed_at?: string | null
          created_at?: string
          data_room_id?: string | null
          deleted_document_ids?: string[] | null
          deleted_folder_ids?: string[] | null
          document_ids?: string[]
          explicit_document_ids?: string[]
          explicit_folder_ids?: string[]
          finalized_by?: string | null
          folder_ids?: string[]
          initiated_by: string
          objects?: Json
          prefixes?: Json
          processing_candidates?: Json
          status?: string
          workspace_id: string
        }
        Update: {
          claim_token?: string
          completed_at?: string | null
          created_at?: string
          data_room_id?: string | null
          deleted_document_ids?: string[] | null
          deleted_folder_ids?: string[] | null
          document_ids?: string[]
          explicit_document_ids?: string[]
          explicit_folder_ids?: string[]
          finalized_by?: string | null
          folder_ids?: string[]
          initiated_by?: string
          objects?: Json
          prefixes?: Json
          processing_candidates?: Json
          status?: string
          workspace_id?: string
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          conversion_status: string
          converted_storage_path: string | null
          counts_towards_storage: boolean
          created_at: string
          created_by: string | null
          document_id: string
          file_type: string
          id: string
          is_free_included: boolean
          original_created_at: string | null
          pruned_at: string | null
          pruned_reason: string | null
          replaced_at: string
          size_bytes: number
          source_folder_id: string | null
          source_scope_data_room_id: string | null
          state: string
          storage_path: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          conversion_status: string
          converted_storage_path?: string | null
          counts_towards_storage?: boolean
          created_at?: string
          created_by?: string | null
          document_id: string
          file_type: string
          id?: string
          is_free_included?: boolean
          original_created_at?: string | null
          pruned_at?: string | null
          pruned_reason?: string | null
          replaced_at?: string
          size_bytes: number
          source_folder_id?: string | null
          source_scope_data_room_id?: string | null
          state?: string
          storage_path: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          conversion_status?: string
          converted_storage_path?: string | null
          counts_towards_storage?: boolean
          created_at?: string
          created_by?: string | null
          document_id?: string
          file_type?: string
          id?: string
          is_free_included?: boolean
          original_created_at?: string | null
          pruned_at?: string | null
          pruned_reason?: string | null
          replaced_at?: string
          size_bytes?: number
          source_folder_id?: string | null
          source_scope_data_room_id?: string | null
          state?: string
          storage_path?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_source_folder_id_fkey"
            columns: ["source_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_source_scope_data_room_id_fkey"
            columns: ["source_scope_data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          conversion_claim_id: string | null
          conversion_duration_ms: number | null
          conversion_engine: string | null
          conversion_fallback_reason: string | null
          conversion_status: string
          converted_storage_path: string | null
          created_at: string
          created_by: string
          data_room_id: string | null
          file_type: string
          folder_id: string | null
          id: string
          num_pages: number | null
          size_bytes: number
          storage_path: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          conversion_claim_id?: string | null
          conversion_duration_ms?: number | null
          conversion_engine?: string | null
          conversion_fallback_reason?: string | null
          conversion_status?: string
          converted_storage_path?: string | null
          created_at?: string
          created_by: string
          data_room_id?: string | null
          file_type: string
          folder_id?: string | null
          id?: string
          num_pages?: number | null
          size_bytes: number
          storage_path: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          conversion_claim_id?: string | null
          conversion_duration_ms?: number | null
          conversion_engine?: string | null
          conversion_fallback_reason?: string | null
          conversion_status?: string
          converted_storage_path?: string | null
          created_at?: string
          created_by?: string
          data_room_id?: string | null
          file_type?: string
          folder_id?: string | null
          id?: string
          num_pages?: number | null
          size_bytes?: number
          storage_path?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_deliveries: {
        Row: {
          claim_token: string
          claimed_at: string
          created_at: string
          dedupe_key: string | null
          error: string | null
          id: string
          sent_at: string | null
          state: string
          template: string
          to_email: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          claim_token?: string
          claimed_at?: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          sent_at?: string | null
          state?: string
          template: string
          to_email: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          claim_token?: string
          claimed_at?: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          sent_at?: string | null
          state?: string
          template?: string
          to_email?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          data_room_id: string | null
          document_id: string | null
          email: string
          expires_at: string
          id: string
          link_id: string
          purpose: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          data_room_id?: string | null
          document_id?: string | null
          email: string
          expires_at: string
          id?: string
          link_id: string
          purpose: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          data_room_id?: string | null
          document_id?: string | null
          email?: string
          expires_at?: string
          id?: string
          link_id?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_otps_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_otps_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_otps_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          form_schema: Json | null
          id: string
          link_id: string | null
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          submission: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          form_schema?: Json | null
          id?: string
          link_id?: string | null
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          submission: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          form_schema?: Json | null
          id?: string
          link_id?: string | null
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          submission?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          created_by: string
          data_room_id: string | null
          id: string
          name: string
          parent_folder_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          data_room_id?: string | null
          id?: string
          name: string
          parent_folder_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data_room_id?: string | null
          id?: string
          name?: string
          parent_folder_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_email_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          dedupe_key: string
          email_key: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          queue_message_id: number | null
          scheduled_for: string
          status: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key: string
          email_key: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          queue_message_id?: number | null
          scheduled_for: string
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string
          email_key?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          queue_message_id?: number | null
          scheduled_for?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_email_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_alc_allowed_documents_emails: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          email: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          email: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          email?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_alc_allowed_documents_emails_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_emails_document_workspace_fkey"
            columns: ["document_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_emails_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_alc_allowed_documents_groups: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          group_id: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          group_id: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          group_id?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_alc_allowed_documents_groups_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_groups_document_workspace_fkey"
            columns: ["document_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_groups_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_groups_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_documents_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_alc_allowed_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_alc_allowed_emails_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_alc_allowed_folders_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          folder_id: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          folder_id: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          folder_id?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_alc_allowed_folders_emails_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_emails_folder_workspace_fkey"
            columns: ["folder_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_emails_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_alc_allowed_folders_groups: {
        Row: {
          created_at: string
          created_by: string | null
          folder_id: string
          group_id: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          folder_id: string
          group_id: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          folder_id?: string
          group_id?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_alc_allowed_folders_groups_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_groups_folder_workspace_fkey"
            columns: ["folder_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_groups_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_groups_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_folders_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_alc_allowed_groups: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_alc_allowed_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_groups_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_alc_allowed_groups_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_alc_allowed_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_allowed_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_allowed_emails_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_allowed_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_allowed_groups: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_allowed_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_allowed_groups_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_allowed_groups_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_allowed_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_blocked_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_blocked_emails_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_blocked_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_blocked_groups: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          link_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          link_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          link_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_blocked_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_blocked_groups_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_blocked_groups_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_blocked_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_preset_allowed_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          preset_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          preset_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          preset_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_preset_allowed_emails_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_preset_allowed_emails_preset_workspace_fkey"
            columns: ["preset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_preset_allowed_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_preset_allowed_groups: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          preset_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          preset_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          preset_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_preset_allowed_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_preset_allowed_groups_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_preset_allowed_groups_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_preset_allowed_groups_preset_workspace_fkey"
            columns: ["preset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_preset_allowed_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_preset_blocked_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          preset_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          preset_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          preset_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_preset_blocked_emails_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_preset_blocked_emails_preset_workspace_fkey"
            columns: ["preset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_preset_blocked_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_preset_blocked_groups: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          preset_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          preset_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          preset_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_preset_blocked_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_preset_blocked_groups_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_preset_blocked_groups_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_preset_blocked_groups_preset_workspace_fkey"
            columns: ["preset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "link_presets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "link_preset_blocked_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      link_presets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          settings_json: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          settings_json?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          settings_json?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_presets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          access: Database["public"]["Enums"]["access_type"]
          apply_watermark: boolean
          can_download: boolean
          collect_email_for_analytics: boolean
          comments_enabled: boolean
          created_at: string
          created_by: string
          curated_qas: Json
          custom_slug: string | null
          data_room_id: string | null
          document_id: string | null
          dynamic_watermark_datetime: boolean
          dynamic_watermark_email: boolean
          dynamic_watermark_ip: boolean
          dynamic_watermark_variables: boolean
          email_notify: boolean
          email_verification: boolean
          expires_at: string | null
          folder_id: string | null
          id: string
          name: string
          nda_gate: boolean
          nda_template_id: string | null
          nda_template_snapshot_html: string | null
          open_once: boolean
          password_hash: string | null
          public_language_override: string | null
          revoked_at: string | null
          screenshot_protection: boolean
          short_code: string
          show_feedback: boolean
          show_qas: boolean
          watermark_id: string | null
          workspace_id: string
        }
        Insert: {
          access?: Database["public"]["Enums"]["access_type"]
          apply_watermark?: boolean
          can_download?: boolean
          collect_email_for_analytics?: boolean
          comments_enabled?: boolean
          created_at?: string
          created_by: string
          curated_qas?: Json
          custom_slug?: string | null
          data_room_id?: string | null
          document_id?: string | null
          dynamic_watermark_datetime?: boolean
          dynamic_watermark_email?: boolean
          dynamic_watermark_ip?: boolean
          dynamic_watermark_variables?: boolean
          email_notify?: boolean
          email_verification?: boolean
          expires_at?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          nda_gate?: boolean
          nda_template_id?: string | null
          nda_template_snapshot_html?: string | null
          open_once?: boolean
          password_hash?: string | null
          public_language_override?: string | null
          revoked_at?: string | null
          screenshot_protection?: boolean
          short_code?: string
          show_feedback?: boolean
          show_qas?: boolean
          watermark_id?: string | null
          workspace_id: string
        }
        Update: {
          access?: Database["public"]["Enums"]["access_type"]
          apply_watermark?: boolean
          can_download?: boolean
          collect_email_for_analytics?: boolean
          comments_enabled?: boolean
          created_at?: string
          created_by?: string
          curated_qas?: Json
          custom_slug?: string | null
          data_room_id?: string | null
          document_id?: string | null
          dynamic_watermark_datetime?: boolean
          dynamic_watermark_email?: boolean
          dynamic_watermark_ip?: boolean
          dynamic_watermark_variables?: boolean
          email_notify?: boolean
          email_verification?: boolean
          expires_at?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          nda_gate?: boolean
          nda_template_id?: string | null
          nda_template_snapshot_html?: string | null
          open_once?: boolean
          password_hash?: string | null
          public_language_override?: string | null
          revoked_at?: string | null
          screenshot_protection?: boolean
          short_code?: string
          show_feedback?: boolean
          show_qas?: boolean
          watermark_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_nda_template_id_fkey"
            columns: ["nda_template_id"]
            isOneToOne: false
            referencedRelation: "nda_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_watermark_id_fkey"
            columns: ["watermark_id"]
            isOneToOne: false
            referencedRelation: "watermarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nda_signatures: {
        Row: {
          data_room_id: string | null
          document_id: string | null
          email: string
          full_name: string
          id: string
          link_id: string | null
          signed_at: string
          signed_pdf_path: string | null
          workspace_id: string
        }
        Insert: {
          data_room_id?: string | null
          document_id?: string | null
          email: string
          full_name: string
          id?: string
          link_id?: string | null
          signed_at?: string
          signed_pdf_path?: string | null
          workspace_id: string
        }
        Update: {
          data_room_id?: string | null
          document_id?: string | null
          email?: string
          full_name?: string
          id?: string
          link_id?: string | null
          signed_at?: string
          signed_pdf_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nda_signatures_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nda_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nda_signatures_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nda_signatures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      nda_templates: {
        Row: {
          archived_at: string | null
          body_html: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          body_html: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          body_html?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nda_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          browser_notifications: boolean
          created_at: string
          email_notifications: boolean
          security_alerts: boolean
          updated_at: string
          user_id: string
          weekly_reports: boolean
        }
        Insert: {
          browser_notifications?: boolean
          created_at?: string
          email_notifications?: boolean
          security_alerts?: boolean
          updated_at?: string
          user_id: string
          weekly_reports?: boolean
        }
        Update: {
          browser_notifications?: boolean
          created_at?: string
          email_notifications?: boolean
          security_alerts?: boolean
          updated_at?: string
          user_id?: string
          weekly_reports?: boolean
        }
        Relationships: []
      }
      onboarding_plan_prompts: {
        Row: {
          context: string
          created_at: string
          first_seen_at: string
          last_seen_at: string
          reminder_sent_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          context: string
          created_at?: string
          first_seen_at?: string
          last_seen_at?: string
          reminder_sent_at?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          context?: string
          created_at?: string
          first_seen_at?: string
          last_seen_at?: string
          reminder_sent_at?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_plan_prompts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      login_alert_rollout: {
        Row: {
          enabled: boolean
          enabled_at: string | null
          singleton: boolean
        }
        Insert: {
          enabled?: boolean
          enabled_at?: string | null
          singleton?: boolean
        }
        Update: {
          enabled?: boolean
          enabled_at?: string | null
          singleton?: boolean
        }
        Relationships: []
      }
      login_session_events: {
        Row: {
          country_code: string | null
          device_label: string | null
          disabled_at: string | null
          eligible: boolean
          occurred_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          country_code?: string | null
          device_label?: string | null
          disabled_at?: string | null
          eligible: boolean
          occurred_at: string
          session_id: string
          user_id: string
        }
        Update: {
          country_code?: string | null
          device_label?: string | null
          disabled_at?: string | null
          eligible?: boolean
          occurred_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          full_name: string | null
          id: string
          industry: string | null
          job_title: string | null
          primary_use_case: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          industry?: string | null
          job_title?: string | null
          primary_use_case?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          primary_use_case?: string | null
        }
        Relationships: []
      }
      qas: {
        Row: {
          answer: string | null
          author_email_hash: string | null
          created_at: string
          id: string
          link_id: string | null
          question: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          workspace_id: string
        }
        Insert: {
          answer?: string | null
          author_email_hash?: string | null
          created_at?: string
          id?: string
          link_id?: string | null
          question: string
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          workspace_id: string
        }
        Update: {
          answer?: string | null
          author_email_hash?: string | null
          created_at?: string
          id?: string
          link_id?: string | null
          question?: string
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qas_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          bucket: string
          count: number
          identifier: string
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          identifier: string
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          identifier?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          company: string
          consent_public_featured: boolean
          created_at: string
          headshot_storage_path: string | null
          id: string
          name: string
          role_title: string
          testimonial: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          company: string
          consent_public_featured?: boolean
          created_at?: string
          headshot_storage_path?: string | null
          id?: string
          name: string
          role_title: string
          testimonial: string
          user_id: string
          workspace_id: string
        }
        Update: {
          company?: string
          consent_public_featured?: boolean
          created_at?: string
          headshot_storage_path?: string | null
          id?: string
          name?: string
          role_title?: string
          testimonial?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_known_devices: {
        Row: {
          device_id: string
          device_label: string | null
          first_seen_at: string
          last_country_code: string | null
          last_seen_at: string
          ua_hash: string | null
          user_id: string
        }
        Insert: {
          device_id: string
          device_label?: string | null
          first_seen_at?: string
          last_country_code?: string | null
          last_seen_at?: string
          ua_hash?: string | null
          user_id: string
        }
        Update: {
          device_id?: string
          device_label?: string | null
          first_seen_at?: string
          last_country_code?: string | null
          last_seen_at?: string
          ua_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_login_baselines: {
        Row: {
          created_at: string
          first_session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          first_session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          first_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_notification_prefs: {
        Row: {
          created_at: string
          onboarding_reminders_enabled: boolean
          security_login_alerts_enabled: boolean
          security_workspace_emails_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          onboarding_reminders_enabled?: boolean
          security_login_alerts_enabled?: boolean
          security_workspace_emails_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          onboarding_reminders_enabled?: boolean
          security_login_alerts_enabled?: boolean
          security_workspace_emails_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watermarks: {
        Row: {
          created_at: string
          definition: Json
          id: string
          image_storage_path: string | null
          is_default: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          definition: Json
          id?: string
          image_storage_path?: string | null
          is_default?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          image_storage_path?: string | null
          is_default?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watermarks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_bandwidth_daily: {
        Row: {
          bytes_served: number
          day: string
          downloads_count: number
          r2_class_a_ops: number
          r2_class_b_ops: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bytes_served?: number
          day: string
          downloads_count?: number
          r2_class_a_ops?: number
          r2_class_b_ops?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bytes_served?: number
          day?: string
          downloads_count?: number
          r2_class_a_ops?: number
          r2_class_b_ops?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_bandwidth_daily_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_document_version_settings: {
        Row: {
          created_at: string
          max_previous_versions: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          max_previous_versions?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          max_previous_versions?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_document_version_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invite_data_room_access: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"]
          created_at: string
          created_by: string | null
          data_room_id: string
          id: string
          invite_id: string
          workspace_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"]
          created_at?: string
          created_by?: string | null
          data_room_id: string
          id?: string
          invite_id: string
          workspace_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"]
          created_at?: string
          created_by?: string | null
          data_room_id?: string
          id?: string
          invite_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invite_data_room_access_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invite_data_room_access_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "workspace_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invite_data_room_access_invite_workspace_fkey"
            columns: ["invite_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_invites"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_invite_data_room_access_room_workspace_fkey"
            columns: ["data_room_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_invite_data_room_access_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          data_rooms_access_all: Database["public"]["Enums"]["access_level"]
          documents_access: Database["public"]["Enums"]["access_level"]
          email: string
          expires_at: string | null
          id: string
          invited_at: string
          invited_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          data_rooms_access_all?: Database["public"]["Enums"]["access_level"]
          documents_access?: Database["public"]["Enums"]["access_level"]
          email: string
          expires_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          data_rooms_access_all?: Database["public"]["Enums"]["access_level"]
          documents_access?: Database["public"]["Enums"]["access_level"]
          email?: string
          expires_at?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          data_rooms_access_all: Database["public"]["Enums"]["access_level"]
          documents_access: Database["public"]["Enums"]["access_level"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          data_rooms_access_all?: Database["public"]["Enums"]["access_level"]
          documents_access?: Database["public"]["Enums"]["access_level"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          data_rooms_access_all?: Database["public"]["Enums"]["access_level"]
          documents_access?: Database["public"]["Enums"]["access_level"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_public_settings: {
        Row: {
          created_at: string
          default_public_language: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_public_language?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_public_language?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_public_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_role_preset_data_rooms: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"]
          created_at: string
          created_by: string | null
          data_room_id: string
          preset_id: string
          workspace_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"]
          created_at?: string
          created_by?: string | null
          data_room_id: string
          preset_id: string
          workspace_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"]
          created_at?: string
          created_by?: string | null
          data_room_id?: string
          preset_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_role_preset_data_rooms_data_room_id_fkey"
            columns: ["data_room_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_role_preset_data_rooms_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "workspace_role_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_role_preset_data_rooms_preset_workspace_fkey"
            columns: ["preset_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_role_presets"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_role_preset_data_rooms_room_workspace_fkey"
            columns: ["data_room_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "data_rooms"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_role_preset_data_rooms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_role_presets: {
        Row: {
          created_at: string
          created_by: string | null
          data_rooms_access_all: Database["public"]["Enums"]["access_level"]
          description: string | null
          documents_access: Database["public"]["Enums"]["access_level"]
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_rooms_access_all?: Database["public"]["Enums"]["access_level"]
          description?: string | null
          documents_access?: Database["public"]["Enums"]["access_level"]
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_rooms_access_all?: Database["public"]["Enums"]["access_level"]
          description?: string | null
          documents_access?: Database["public"]["Enums"]["access_level"]
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_role_presets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_storage_current: {
        Row: {
          storage_used_bytes: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          storage_used_bytes?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          storage_used_bytes?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_storage_current_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_storage_daily: {
        Row: {
          day: string
          storage_used_bytes: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          day: string
          storage_used_bytes?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          day?: string
          storage_used_bytes?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_storage_daily_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          billing_interval: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_ends_at: string | null
          current_period_started_at: string | null
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_used_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_interval: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_ends_at?: string | null
          current_period_started_at?: string | null
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_used_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_interval?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_ends_at?: string | null
          current_period_started_at?: string | null
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_used_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_user_group_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          group_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          group_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          group_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_user_group_emails_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_user_group_emails_group_workspace_fkey"
            columns: ["group_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_user_groups"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_user_group_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_user_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_user_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          active_custom_domain_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          active_custom_domain_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          active_custom_domain_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_active_custom_domain_id_fkey"
            columns: ["active_custom_domain_id"]
            isOneToOne: false
            referencedRelation: "custom_domains"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_document_artifact_cleanup: {
        Args: { p_candidate_token: string }
        Returns: Json
      }
      apply_workspace_storage_delta: {
        Args: { p_delta: number; p_workspace_id: string }
        Returns: undefined
      }
      auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      begin_document_artifact_upload: {
        Args: { p_candidate_token: string }
        Returns: Json
      }
      can_access_data_room: {
        Args: { room_id: string; ws: string }
        Returns: boolean
      }
      can_access_workspace_documents: { Args: { ws: string }; Returns: boolean }
      can_create_data_room: { Args: { ws: string }; Returns: boolean }
      can_edit_data_room: {
        Args: { room_id: string; ws: string }
        Returns: boolean
      }
      can_edit_workspace_documents: { Args: { ws: string }; Returns: boolean }
      activate_login_session_alerts: { Args: never; Returns: undefined }
      claim_email_delivery: {
        Args: {
          p_claim_timeout?: string
          p_dedupe_key?: string
          p_template: string
          p_to_email: string
          p_user_id?: string
          p_workspace_id?: string
        }
        Returns: {
          claim_status: string
          claim_token: string
          delivery_id: string
        }[]
      }
      claim_lifecycle_email_jobs: {
        Args: { p_limit?: number; p_now?: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          created_at: string
          dedupe_key: string
          email_key: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          queue_message_id: number | null
          scheduled_for: string
          status: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "lifecycle_email_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      delete_data_room_cascade: {
        Args: { p_data_room_id: string; p_workspace_id: string }
        Returns: {
          logical_bucket: string
          storage_path: string
        }[]
      }
      delete_document_selection: {
        Args: {
          p_actor_id: string
          p_claim_token: string
          p_workspace_id: string
        }
        Returns: Json
      }
      delete_workspace_cascade: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      document_artifact_candidate_payload: {
        Args: {
          p_candidate: Database["public"]["Tables"]["document_artifact_candidates"]["Row"]
        }
        Returns: Json
      }
      document_deletion_claim_plan: {
        Args: {
          p_claim: Database["public"]["Tables"]["document_deletion_claims"]["Row"]
        }
        Returns: Json
      }
      enrich_login_session_event: {
        Args: {
          p_country_code?: string
          p_device_label: string
          p_session_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      enqueue_lifecycle_email_job: {
        Args: {
          p_dedupe_key?: string
          p_email_key: string
          p_payload?: Json
          p_scheduled_for?: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: string
      }
      finalize_lifecycle_email_job: {
        Args: { p_job_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      finish_document_artifact_upload: {
        Args: { p_candidate_token: string }
        Returns: Json
      }
      get_dashboard_kpis: {
        Args: { p_workspace_id: string }
        Returns: {
          total_downloads: number
          total_views: number
          unique_viewers: number
        }[]
      }
      get_data_room_metrics_v2: {
        Args: {
          p_data_room_ids: string[]
          p_from_ts?: string
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          data_room_id: string
          total_downloads: number
          total_time_ms: number
          total_views: number
          unique_views: number
        }[]
      }
      get_document_artifact_candidate: {
        Args: { p_candidate_token: string }
        Returns: Json
      }
      get_document_deletion_claim_state: {
        Args: { p_document_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_document_link_metrics_v2: {
        Args: {
          p_content_paths?: string[]
          p_document_id: string
          p_from_ts?: string
          p_link_ids: string[]
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          last_seen_at: string
          link_id: string
          total_downloads: number
          total_page_views: number
          total_revisits: number
          total_time_ms: number
          total_views: number
          unique_viewers: number
        }[]
      }
      get_document_page_attention_v2: {
        Args: {
          p_content_paths?: string[]
          p_document_id: string
          p_from_ts?: string
          p_link_ids: string[]
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          page_number: number
          total_time_ms: number
        }[]
      }
      get_document_viewer_insights_export_v2: {
        Args: {
          p_content_paths?: string[]
          p_document_id: string
          p_from_ts?: string
          p_link_ids: string[]
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          content_path: string
          document_id: string
          download_count: number
          last_seen_at: string
          link_id: string
          total_time_ms: number
          view_count: number
          viewer_email: string
          viewer_key: string
        }[]
      }
      get_document_viewer_insights_v2: {
        Args: {
          p_content_paths?: string[]
          p_document_id: string
          p_from_ts?: string
          p_link_ids: string[]
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          content_path: string
          document_id: string
          download_count: number
          last_seen_at: string
          link_id: string
          total_time_ms: number
          view_count: number
          viewer_email: string
          viewer_key: string
        }[]
      }
      get_document_viewer_pages_v2: {
        Args: {
          p_content_paths?: string[]
          p_document_id: string
          p_from_ts?: string
          p_link_ids: string[]
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          document_id: string
          last_seen_at: string
          page_number: number
          total_time_ms: number
          viewer_key: string
        }[]
      }
      get_documents_metrics_v2: {
        Args: {
          p_document_ids: string[]
          p_from_ts?: string
          p_link_id?: string
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          document_id: string
          last_seen_at: string
          total_downloads: number
          total_revisits: number
          total_time_ms: number
          total_views: number
          unique_viewers: number
        }[]
      }
      get_documents_page_attention_v2: {
        Args: {
          p_document_ids: string[]
          p_from_ts?: string
          p_link_id?: string
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          document_id: string
          page_number: number
          total_time_ms: number
        }[]
      }
      get_documents_viewer_insights_v2: {
        Args: {
          p_document_ids: string[]
          p_from_ts?: string
          p_link_id?: string
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          content_path: string
          document_id: string
          download_count: number
          last_seen_at: string
          link_id: string
          total_time_ms: number
          view_count: number
          viewer_email: string
          viewer_key: string
        }[]
      }
      get_documents_viewer_pages_v2: {
        Args: {
          p_document_ids: string[]
          p_from_ts?: string
          p_link_id?: string
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          document_id: string
          last_seen_at: string
          page_number: number
          total_time_ms: number
          viewer_key: string
        }[]
      }
      get_link_country_views: {
        Args: { p_link_ids: string[]; p_workspace_id: string }
        Returns: {
          country_code: string
          total_views: number
        }[]
      }
      get_link_country_views_v2: {
        Args: {
          p_content_paths?: string[]
          p_from_ts?: string
          p_link_ids: string[]
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          country_code: string
          total_views: number
        }[]
      }
      get_most_active_content: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          resource_id: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          title: string
          total_views: number
        }[]
      }
      get_resource_link_metrics_v2: {
        Args: {
          p_from_ts?: string
          p_link_ids: string[]
          p_resource_id: string
          p_resource_type: Database["public"]["Enums"]["resource_type"]
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          last_seen_at: string
          link_id: string
          total_downloads: number
          total_page_views: number
          total_revisits: number
          total_time_ms: number
          total_views: number
          unique_viewers: number
        }[]
      }
      get_top_viewers: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          email: string
          last_seen_at: string
          view_count: number
        }[]
      }
      get_workspace_kpis_v2: {
        Args: { p_from_ts?: string; p_to_ts?: string; p_workspace_id: string }
        Returns: {
          total_downloads: number
          total_views: number
          unique_viewers: number
        }[]
      }
      get_workspace_most_active_documents_v2: {
        Args: {
          p_from_ts?: string
          p_limit?: number
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          document_id: string
          total_views: number
        }[]
      }
      get_workspace_top_countries_v2: {
        Args: {
          p_from_ts?: string
          p_limit?: number
          p_to_ts?: string
          p_workspace_id: string
        }
        Returns: {
          country_code: string
          total_views: number
        }[]
      }
      has_workspace_role: {
        Args: { roles: string[]; ws: string }
        Returns: boolean
      }
      increment_document_country_view: {
        Args: { p_country_code: string; p_workspace_id: string }
        Returns: undefined
      }
      increment_link_country_view: {
        Args: {
          p_country_code: string
          p_link_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      invoke_lifecycle_email_worker: { Args: never; Returns: number }
      is_workspace_member: { Args: { ws: string }; Returns: boolean }
      list_due_founder_help_candidates: {
        Args: { p_cutoff: string; p_limit?: number; p_now?: string }
        Returns: {
          owner_user_id: string
          trial_started_at: string
          workspace_id: string
        }[]
      }
      list_inactive_workspace_owner_candidates: {
        Args: { p_cutoff: string; p_limit?: number }
        Returns: {
          last_sign_in_at: string
          onboarding_reminders_enabled: boolean
          owner_email: string
          owner_user_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      lock_document_deletion_resources: {
        Args: { p_document_ids: string[]; p_folder_ids: string[] }
        Returns: undefined
      }
      lock_workspace_free_plan_guard: {
        Args: { ws: string }
        Returns: undefined
      }
      mark_document_artifact_cleanup_failed: {
        Args: { p_candidate_token: string; p_error: string }
        Returns: Json
      }
      mark_email_delivery_failed: {
        Args: { p_claim_token: string; p_delivery_id: string; p_error: string }
        Returns: boolean
      }
      mark_email_delivery_sent: {
        Args: { p_claim_token: string; p_delivery_id: string }
        Returns: boolean
      }
      plan_document_selection_deletion: {
        Args: {
          p_actor_id: string
          p_data_room_id?: string
          p_document_ids?: string[]
          p_folder_ids?: string[]
          p_workspace_id: string
        }
        Returns: Json
      }
      prune_public_analytics_v2: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      prune_rate_limit_events: {
        Args: { p_keep_hours?: number }
        Returns: number
      }
      prune_workspace_bandwidth_daily: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      publish_document_conversion_candidate: {
        Args: {
          p_candidate_token: string
          p_num_pages: number
          p_updated_at: string
        }
        Returns: Json
      }
      publish_document_nda_candidate: {
        Args: { p_candidate_token: string }
        Returns: Json
      }
      record_internal_audit_event: {
        Args: {
          p_data_room_id?: string
          p_document_id?: string
          p_event_type: string
          p_metadata?: Json
          p_resource_id: string
          p_resource_type: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      record_public_analytics_event: {
        Args: {
          p_anonymous_user_id: string
          p_document_id: string
          p_duration_ms: number
          p_event: Database["public"]["Enums"]["analytics_event_type"]
          p_link_id: string
          p_page_number: number
          p_resource_category: Database["public"]["Enums"]["analytics_resource_category"]
          p_resource_id: string
          p_resource_type: Database["public"]["Enums"]["resource_type"]
          p_section_offset: number
          p_session_id: string
          p_viewer_email: string
          p_viewer_key: string
          p_workspace_id: string
        }
        Returns: {
          is_revisit: boolean
          is_unique_view: boolean
        }[]
      }
      record_public_analytics_event_v2: {
        Args: {
          p_anonymous_user_id: string
          p_content_path: string
          p_country_code?: string
          p_document_id: string
          p_duration_ms: number
          p_event: Database["public"]["Enums"]["analytics_event_type"]
          p_link_id: string
          p_page_number: number
          p_resource_id: string
          p_resource_type: Database["public"]["Enums"]["resource_type"]
          p_section_offset: number
          p_session_id: string
          p_viewer_email: string
          p_viewer_key: string
          p_workspace_id: string
        }
        Returns: {
          is_revisit: boolean
          is_unique_view: boolean
        }[]
      }
      record_rate_limit_attempt: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_increment?: number
          p_window_start: string
        }
        Returns: number
      }
      record_workspace_bandwidth: {
        Args: {
          p_bytes: number
          p_downloads?: number
          p_r2_class_a_ops?: number
          p_r2_class_b_ops?: number
          p_workspace_id: string
        }
        Returns: undefined
      }
      register_document_artifact_candidate: {
        Args: {
          p_artifact_kind: string
          p_candidate_token: string
          p_document_id: string
          p_logical_bucket: string
          p_nda_signature_id?: string
          p_producer_token: string
          p_source_storage_path?: string
          p_storage_path: string
          p_workspace_id: string
        }
        Returns: Json
      }
      replace_link_alc_rules: {
        Args: { p_link_id: string; p_payload: Json; p_workspace_id: string }
        Returns: undefined
      }
      replace_link_allowlist_rules: {
        Args: {
          p_allowed_emails?: string[]
          p_allowed_group_ids?: string[]
          p_blocked_emails?: string[]
          p_blocked_group_ids?: string[]
          p_link_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      replace_link_preset_rules: {
        Args: {
          p_allowed_emails?: string[]
          p_allowed_group_ids?: string[]
          p_blocked_emails?: string[]
          p_blocked_group_ids?: string[]
          p_preset_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      requeue_skipped_founder_help_job: {
        Args: { p_dedupe_key: string }
        Returns: boolean
      }
      reschedule_lifecycle_email_job: {
        Args: { p_job_id: string; p_scheduled_for: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          created_at: string
          dedupe_key: string
          email_key: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          queue_message_id: number | null
          scheduled_for: string
          status: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "lifecycle_email_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_public_link: {
        Args: {
          accept_nda: boolean
          document_id: string
          email: string
          link_id: string
          password: string
        }
        Returns: {
          apply_watermark: boolean
          can_download: boolean
          comments_enabled: boolean
          conversion_status: string
          converted_storage_path: string
          curated_qas: Json
          doc_id: string
          dynamic_watermark_datetime: boolean
          dynamic_watermark_email: boolean
          dynamic_watermark_ip: boolean
          dynamic_watermark_variables: boolean
          email_notify: boolean
          email_verification: boolean
          expires_at: string
          file_type: string
          num_pages: number
          screenshot_protection: boolean
          show_feedback: boolean
          show_qas: boolean
          storage_path: string
          title: string
          watermark_id: string
          workspace_name: string
        }[]
      }
      resolve_workspace_for_ingest: {
        Args: { _link_id: string; _resource_id: string }
        Returns: string
      }
      update_workspace_user_group_atomic: {
        Args: {
          p_emails?: string[]
          p_group_id: string
          p_name: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      upsert_link_preset: {
        Args: {
          p_allowed_emails?: string[]
          p_allowed_group_ids?: string[]
          p_blocked_emails?: string[]
          p_blocked_group_ids?: string[]
          p_name: string
          p_settings_json: Json
          p_workspace_id: string
        }
        Returns: {
          id: string
          name: string
        }[]
      }
      workspace_allows_new_member: { Args: { ws: string }; Returns: boolean }
      workspace_effective_plan_id: { Args: { ws: string }; Returns: string }
      workspace_has_entitlement: { Args: { ws: string }; Returns: boolean }
      workspace_name_available: {
        Args: { target_name: string }
        Returns: boolean
      }
    }
    Enums: {
      access_level: "none" | "viewer" | "editor"
      access_type: "public" | "protected"
      analytics_event_type: "view" | "download" | "page_view" | "section_time"
      analytics_resource_category:
        | "doc"
        | "image"
        | "audio"
        | "video"
        | "data_room"
      resource_type: "document" | "folder" | "data_room"
      subscription_status:
        | "none"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
        | "incomplete"
      user_role: "owner" | "editor" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  auth: {
    Enums: {
      aal_level: ["aal1", "aal2", "aal3"],
      code_challenge_method: ["s256", "plain"],
      factor_status: ["unverified", "verified"],
      factor_type: ["totp", "webauthn", "phone"],
      oauth_authorization_status: ["pending", "approved", "denied", "expired"],
      oauth_client_type: ["public", "confidential"],
      oauth_registration_type: ["dynamic", "manual"],
      oauth_response_type: ["code"],
      one_time_token_type: [
        "confirmation_token",
        "reauthentication_token",
        "recovery_token",
        "email_change_token_new",
        "email_change_token_current",
        "phone_change_token",
      ],
    },
  },
  public: {
    Enums: {
      access_level: ["none", "viewer", "editor"],
      access_type: ["public", "protected"],
      analytics_event_type: ["view", "download", "page_view", "section_time"],
      analytics_resource_category: [
        "doc",
        "image",
        "audio",
        "video",
        "data_room",
      ],
      resource_type: ["document", "folder", "data_room"],
      subscription_status: [
        "none",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
        "incomplete",
      ],
      user_role: ["owner", "editor", "viewer"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

