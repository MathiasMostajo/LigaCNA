export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cna_admins: {
        Row: {
          active: boolean
          created_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cna_audit_events: {
        Row: {
          action: string
          actor_id: string | null
          client_id: string | null
          created_at: string
          id: string
          submission_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          submission_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cna_audit_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "cna_ingestion_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_audit_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "cna_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_club_summaries: {
        Row: {
          club_id: string
          draws: number
          ga: number
          gf: number
          id: string
          losses: number
          season_id: string
          slot_id: string
          source: string
          wins: number
        }
        Insert: {
          club_id: string
          draws: number
          ga: number
          gf: number
          id?: string
          losses: number
          season_id: string
          slot_id: string
          source: string
          wins: number
        }
        Update: {
          club_id?: string
          draws?: number
          ga?: number
          gf?: number
          id?: string
          losses?: number
          season_id?: string
          slot_id?: string
          source?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "cna_club_summaries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "cna_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_club_summaries_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_club_summaries_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "cna_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_clubs: {
        Row: {
          abbreviation: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      cna_competitions: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cna_ingestion_clients: {
        Row: {
          active: boolean
          competition_id: string
          created_at: string
          id: string
          name: string
          phase_id: string | null
          phone_number_id: string
          season_id: string | null
          token_sha256: string
        }
        Insert: {
          active?: boolean
          competition_id: string
          created_at?: string
          id?: string
          name: string
          phase_id?: string | null
          phone_number_id: string
          season_id?: string | null
          token_sha256: string
        }
        Update: {
          active?: boolean
          competition_id?: string
          created_at?: string
          id?: string
          name?: string
          phase_id?: string | null
          phone_number_id?: string
          season_id?: string | null
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "cna_ingestion_clients_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "cna_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_ingestion_clients_phase_id_season_id_competition_id_fkey"
            columns: ["phase_id", "season_id", "competition_id"]
            isOneToOne: false
            referencedRelation: "cna_phases"
            referencedColumns: ["id", "season_id", "competition_id"]
          },
          {
            foreignKeyName: "cna_ingestion_clients_season_id_competition_id_fkey"
            columns: ["season_id", "competition_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id", "competition_id"]
          },
        ]
      }
      cna_league_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail: Json
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      cna_matches: {
        Row: {
          away_club: string
          away_goals: number | null
          away_slot: string
          home_club: string
          home_goals: number | null
          home_slot: string
          id: string
          phase: string
          played_at: string | null
          report_id: string | null
          round: number
          season_id: string
          source: string
          status: string
        }
        Insert: {
          away_club: string
          away_goals?: number | null
          away_slot: string
          home_club: string
          home_goals?: number | null
          home_slot: string
          id?: string
          phase: string
          played_at?: string | null
          report_id?: string | null
          round: number
          season_id: string
          source?: string
          status: string
        }
        Update: {
          away_club?: string
          away_goals?: number | null
          away_slot?: string
          home_club?: string
          home_goals?: number | null
          home_slot?: string
          id?: string
          phase?: string
          played_at?: string | null
          report_id?: string | null
          round?: number
          season_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cna_matches_away_club_fkey"
            columns: ["away_club"]
            isOneToOne: false
            referencedRelation: "cna_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_matches_away_slot_fkey"
            columns: ["away_slot"]
            isOneToOne: false
            referencedRelation: "cna_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_matches_home_club_fkey"
            columns: ["home_club"]
            isOneToOne: false
            referencedRelation: "cna_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_matches_home_slot_fkey"
            columns: ["home_slot"]
            isOneToOne: false
            referencedRelation: "cna_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_matches_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "cna_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_phases: {
        Row: {
          competition_id: string
          id: string
          name: string
          season_id: string
          slug: string
        }
        Insert: {
          competition_id: string
          id?: string
          name: string
          season_id: string
          slug: string
        }
        Update: {
          competition_id?: string
          id?: string
          name?: string
          season_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "cna_phases_season_id_competition_id_fkey"
            columns: ["season_id", "competition_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id", "competition_id"]
          },
        ]
      }
      cna_player_stats: {
        Row: {
          assists: number | null
          clean_sheet: boolean | null
          club_id: string
          conceded: number | null
          goals: number | null
          match_id: string
          player_id: string
          rating: number | null
          saves: number | null
        }
        Insert: {
          assists?: number | null
          clean_sheet?: boolean | null
          club_id: string
          conceded?: number | null
          goals?: number | null
          match_id: string
          player_id: string
          rating?: number | null
          saves?: number | null
        }
        Update: {
          assists?: number | null
          clean_sheet?: boolean | null
          club_id?: string
          conceded?: number | null
          goals?: number | null
          match_id?: string
          player_id?: string
          rating?: number | null
          saves?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cna_player_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "cna_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_player_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "cna_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "cna_players"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_player_summaries: {
        Row: {
          appearances: number | null
          assists: number | null
          clean_sheets: number | null
          club_id: string
          conceded: number | null
          goals: number | null
          id: string
          player_id: string
          rating: number | null
          saves: number | null
          season_id: string
          source: string
        }
        Insert: {
          appearances?: number | null
          assists?: number | null
          clean_sheets?: number | null
          club_id: string
          conceded?: number | null
          goals?: number | null
          id?: string
          player_id: string
          rating?: number | null
          saves?: number | null
          season_id: string
          source: string
        }
        Update: {
          appearances?: number | null
          assists?: number | null
          clean_sheets?: number | null
          club_id?: string
          conceded?: number | null
          goals?: number | null
          id?: string
          player_id?: string
          rating?: number | null
          saves?: number | null
          season_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "cna_player_summaries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "cna_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_player_summaries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "cna_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_player_summaries_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_players: {
        Row: {
          created_at: string
          ea_id: string
          id: string
          name: string
          position: string
        }
        Insert: {
          created_at?: string
          ea_id: string
          id?: string
          name: string
          position?: string
        }
        Update: {
          created_at?: string
          ea_id?: string
          id?: string
          name?: string
          position?: string
        }
        Relationships: []
      }
      cna_reports: {
        Row: {
          ai_output: Json | null
          created_at: string
          created_by: string | null
          id: string
          payload: Json
          review_note: string
          season_id: string
          status: string
          submission_id: string | null
          updated_at: string
        }
        Insert: {
          ai_output?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          review_note?: string
          season_id: string
          status?: string
          submission_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_output?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          review_note?: string
          season_id?: string
          status?: string
          submission_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cna_reports_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_reports_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "cna_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_rosters: {
        Row: {
          club_id: string
          end_round: number | null
          id: string
          player_id: string
          season_id: string
          start_round: number
        }
        Insert: {
          club_id: string
          end_round?: number | null
          id?: string
          player_id: string
          season_id: string
          start_round: number
        }
        Update: {
          club_id?: string
          end_round?: number | null
          id?: string
          player_id?: string
          season_id?: string
          start_round?: number
        }
        Relationships: [
          {
            foreignKeyName: "cna_rosters_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "cna_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "cna_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_rosters_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_seasons: {
        Row: {
          competition_id: string
          created_at: string
          data_mode: string
          draw_points: number
          id: string
          name: string
          published: boolean
          status: string
          win_points: number
          year: number
        }
        Insert: {
          competition_id: string
          created_at?: string
          data_mode?: string
          draw_points?: number
          id?: string
          name: string
          published?: boolean
          status?: string
          win_points?: number
          year?: number
        }
        Update: {
          competition_id?: string
          created_at?: string
          data_mode?: string
          draw_points?: number
          id?: string
          name?: string
          published?: boolean
          status?: string
          win_points?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "cna_seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "cna_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_slots: {
        Row: {
          id: string
          label: string
          season_id: string
        }
        Insert: {
          id?: string
          label: string
          season_id: string
        }
        Update: {
          id?: string
          label?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cna_slots_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_stints: {
        Row: {
          club_id: string
          end_round: number | null
          id: string
          reason: string
          slot_id: string
          start_round: number
        }
        Insert: {
          club_id: string
          end_round?: number | null
          id?: string
          reason?: string
          slot_id: string
          start_round: number
        }
        Update: {
          club_id?: string
          end_round?: number | null
          id?: string
          reason?: string
          slot_id?: string
          start_round?: number
        }
        Relationships: [
          {
            foreignKeyName: "cna_stints_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "cna_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_stints_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "cna_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_submissions: {
        Row: {
          competition_id: string
          created_at: string
          evidence_bytes: number
          evidence_sha256: string
          id: string
          original_filename: string | null
          original_image_path: string
          original_mime_type: string
          phase_id: string | null
          raw_metadata: Json
          received_at: string
          season_id: string | null
          sender_phone: string
          status: string
          updated_at: string
          upload_intent_id: string
          whatsapp_media_id: string
          whatsapp_message_id: string
          whatsapp_phone_number_id: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          evidence_bytes: number
          evidence_sha256: string
          id?: string
          original_filename?: string | null
          original_image_path: string
          original_mime_type: string
          phase_id?: string | null
          raw_metadata?: Json
          received_at: string
          season_id?: string | null
          sender_phone: string
          status?: string
          updated_at?: string
          upload_intent_id: string
          whatsapp_media_id: string
          whatsapp_message_id: string
          whatsapp_phone_number_id: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          evidence_bytes?: number
          evidence_sha256?: string
          id?: string
          original_filename?: string | null
          original_image_path?: string
          original_mime_type?: string
          phase_id?: string | null
          raw_metadata?: Json
          received_at?: string
          season_id?: string | null
          sender_phone?: string
          status?: string
          updated_at?: string
          upload_intent_id?: string
          whatsapp_media_id?: string
          whatsapp_message_id?: string
          whatsapp_phone_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cna_submissions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "cna_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_submissions_phase_id_season_id_competition_id_fkey"
            columns: ["phase_id", "season_id", "competition_id"]
            isOneToOne: false
            referencedRelation: "cna_phases"
            referencedColumns: ["id", "season_id", "competition_id"]
          },
          {
            foreignKeyName: "cna_submissions_season_id_competition_id_fkey"
            columns: ["season_id", "competition_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id", "competition_id"]
          },
          {
            foreignKeyName: "cna_submissions_upload_intent_id_fkey"
            columns: ["upload_intent_id"]
            isOneToOne: true
            referencedRelation: "cna_upload_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      cna_upload_intents: {
        Row: {
          client_id: string
          competition_id: string
          completed_at: string | null
          created_at: string
          id: string
          message_id: string
          object_path: string
          payload: Json
          phase_id: string | null
          phone_number_id: string
          season_id: string | null
        }
        Insert: {
          client_id: string
          competition_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          message_id: string
          object_path: string
          payload: Json
          phase_id?: string | null
          phone_number_id: string
          season_id?: string | null
        }
        Update: {
          client_id?: string
          competition_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          message_id?: string
          object_path?: string
          payload?: Json
          phase_id?: string | null
          phone_number_id?: string
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cna_upload_intents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "cna_ingestion_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_upload_intents_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "cna_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cna_upload_intents_phase_id_season_id_competition_id_fkey"
            columns: ["phase_id", "season_id", "competition_id"]
            isOneToOne: false
            referencedRelation: "cna_phases"
            referencedColumns: ["id", "season_id", "competition_id"]
          },
          {
            foreignKeyName: "cna_upload_intents_season_id_competition_id_fkey"
            columns: ["season_id", "competition_id"]
            isOneToOne: false
            referencedRelation: "cna_seasons"
            referencedColumns: ["id", "competition_id"]
          },
        ]
      }
      fichaje_requests: {
        Row: {
          created_at: string | null
          id: string
          league_id: string
          player_name: string
          pos: string | null
          season_id: string | null
          status: string | null
          team_id: string
          team_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          league_id: string
          player_name: string
          pos?: string | null
          season_id?: string | null
          status?: string | null
          team_id: string
          team_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          league_id?: string
          player_name?: string
          pos?: string | null
          season_id?: string | null
          status?: string | null
          team_id?: string
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichaje_requests_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichaje_requests_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichaje_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          active_season_id: string | null
          admin_id: string
          created_at: string | null
          id: string
          is_public: boolean | null
          max_players_per_team: number | null
          max_teams: number | null
          name: string
          plan_type: string | null
          settings: Json | null
          slug: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          active_season_id?: string | null
          admin_id: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          max_players_per_team?: number | null
          max_teams?: number | null
          name: string
          plan_type?: string | null
          settings?: Json | null
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          active_season_id?: string | null
          admin_id?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          max_players_per_team?: number | null
          max_teams?: number | null
          name?: string
          plan_type?: string | null
          settings?: Json | null
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_active_season_id_fkey"
            columns: ["active_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      liga_data: {
        Row: {
          data: Json
          id: string
          updated_at: string | null
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_goals: number | null
          away_id: string
          created_at: string | null
          date: string | null
          home_goals: number | null
          home_id: string
          id: string
          league_id: string
          player_stats: Json | null
          round: number | null
          season_id: string | null
        }
        Insert: {
          away_goals?: number | null
          away_id: string
          created_at?: string | null
          date?: string | null
          home_goals?: number | null
          home_id: string
          id?: string
          league_id: string
          player_stats?: Json | null
          round?: number | null
          season_id?: string | null
        }
        Update: {
          away_goals?: number | null
          away_id?: string
          created_at?: string | null
          date?: string | null
          home_goals?: number | null
          home_id?: string
          id?: string
          league_id?: string
          player_stats?: Json | null
          round?: number | null
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_id_fkey"
            columns: ["away_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          assists: number | null
          created_at: string | null
          cs: number | null
          goals: number | null
          id: string
          league_id: string
          matches_played: number | null
          name: string
          pos: string | null
          ratings: number[] | null
          season_id: string | null
          team_id: string
        }
        Insert: {
          assists?: number | null
          created_at?: string | null
          cs?: number | null
          goals?: number | null
          id?: string
          league_id: string
          matches_played?: number | null
          name: string
          pos?: string | null
          ratings?: number[] | null
          season_id?: string | null
          team_id: string
        }
        Update: {
          assists?: number | null
          created_at?: string | null
          cs?: number | null
          goals?: number | null
          id?: string
          league_id?: string
          matches_played?: number | null
          name?: string
          pos?: string | null
          ratings?: number[] | null
          season_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_trial_scans: number | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          plan_type: string | null
          role: string | null
          scans_reset_month: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
        }
        Insert: {
          ai_trial_scans?: number | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          plan_type?: string | null
          role?: string | null
          scans_reset_month?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
        }
        Update: {
          ai_trial_scans?: number | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          plan_type?: string | null
          role?: string | null
          scans_reset_month?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
      removal_requests: {
        Row: {
          created_at: string | null
          id: string
          league_id: string
          player_id: string
          player_name: string | null
          season_id: string | null
          status: string | null
          team_id: string
          team_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          league_id: string
          player_id: string
          player_name?: string | null
          season_id?: string | null
          status?: string | null
          team_id: string
          team_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          league_id?: string
          player_id?: string
          player_name?: string | null
          season_id?: string | null
          status?: string | null
          team_id?: string
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "removal_requests_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_requests_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          archived_at: string | null
          champion: string | null
          created_at: string | null
          id: string
          league_id: string
          name: string
          playoff_champion: string | null
          status: string | null
        }
        Insert: {
          archived_at?: string | null
          champion?: string | null
          created_at?: string | null
          id?: string
          league_id: string
          name?: string
          playoff_champion?: string | null
          status?: string | null
        }
        Update: {
          archived_at?: string | null
          champion?: string | null
          created_at?: string | null
          id?: string
          league_id?: string
          name?: string
          playoff_champion?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          created_at: string | null
          id: string
          league_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          scan_result: Json
          season_id: string | null
          status: string | null
          team_code: string | null
          team_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          league_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_result: Json
          season_id?: string | null
          status?: string | null
          team_code?: string | null
          team_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          league_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scan_result?: Json
          season_id?: string | null
          status?: string | null
          team_code?: string | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          email: string
          id: string
          joined_at: string | null
          league_id: string
          role: string | null
          team_id: string
          user_id: string | null
        }
        Insert: {
          email: string
          id?: string
          joined_at?: string | null
          league_id: string
          role?: string | null
          team_id: string
          user_id?: string | null
        }
        Update: {
          email?: string
          id?: string
          joined_at?: string | null
          league_id?: string
          role?: string | null
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          code: string | null
          created_at: string | null
          id: string
          is_bye: boolean | null
          league_id: string
          name: string
          paid: boolean | null
          paid_at: string | null
          payment_amount: number | null
          payment_email: string | null
          payment_id: string | null
          replaced: boolean | null
          season_id: string | null
          shield_url: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string
          is_bye?: boolean | null
          league_id: string
          name: string
          paid?: boolean | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_email?: string | null
          payment_id?: string | null
          replaced?: boolean | null
          season_id?: string | null
          shield_url?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string
          is_bye?: boolean | null
          league_id?: string
          name?: string
          paid?: boolean | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_email?: string | null
          payment_id?: string | null
          replaced?: boolean | null
          season_id?: string | null
          shield_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_email: { Args: never; Returns: string }
      cna_finalize_upload: {
        Args: {
          p_bytes: number
          p_client_id: string
          p_intent_id: string
          p_sha256: string
        }
        Returns: Json
      }
      cna_league_data: { Args: never; Returns: Json }
      cna_manage: { Args: { p_action: string; p_data: Json }; Returns: string }
      cna_prepare_upload: {
        Args: { p_client_id: string; p_message_hash: string; p_payload: Json }
        Returns: Json
      }
      cna_rankings: {
        Args: { p_phase?: string; p_season?: string }
        Returns: Json
      }
      get_inscription_info: { Args: { p_team_id: string }; Returns: Json }
      get_payment_receipt: { Args: { p_team_id: string }; Returns: Json }
      get_server_month: { Args: never; Returns: string }
      get_user_plan_limits: { Args: { p_user_id: string }; Returns: Json }
      is_superadmin: { Args: never; Returns: boolean }
      join_team_by_code: { Args: { p_code: string }; Returns: Json }
      mark_team_paid: {
        Args: {
          p_amount: number
          p_email: string
          p_payment_id: string
          p_team_id: string
        }
        Returns: undefined
      }
      user_league_id: { Args: never; Returns: string }
      user_owns_league: { Args: { check_league_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const


