export type Season={id:string;name:string;year:number;published:boolean;data_mode:'matches'|'summary';status:'active'|'archived';win_points:number;draw_points:number};
export type Club={id:string;name:string;abbreviation:string};
export type Player={id:string;name:string;ea_id:string;position:string};
export type Slot={id:string;season_id:string;label:string};
export type Stint={id:string;slot_id:string;club_id:string;start_round:number;end_round:number|null;reason:string};
export type Roster={id:string;season_id:string;club_id:string;player_id:string;start_round:number;end_round:number|null};
export type Stat={player_id:string;club_id:string;goals:number|null;assists:number|null;rating:number|null;clean_sheet?:boolean|null;saves?:number|null;conceded?:number|null};
export type Match={id:string;report_id:string|null;season_id:string;phase:string;round:number;home_club:string;away_club:string;home_slot:string;away_slot:string;home_goals:number|null;away_goals:number|null;played_at:string|null;status:'scheduled'|'approved';source:string};
export type Payload={phase:string;round:number;home_club:string;away_club:string;home_goals:number|null;away_goals:number|null;played_at:string|null;source:string;players:Stat[];match_id?:string};
export type Report={id:string;season_id:string;submission_id:string|null;status:string;payload:Payload;ai_output:unknown;review_note:string;updated_at:string};
export type ClubSummary={id:string;season_id:string;club_id:string;slot_id:string;wins:number;draws:number;losses:number;gf:number;ga:number;source:string};
export type PlayerSummary={id:string;season_id:string;club_id:string;player_id:string;appearances:number|null;goals:number|null;assists:number|null;rating:number|null;clean_sheets:number|null;saves:number|null;conceded:number|null;source:string};
export type League={seasons:Season[];clubs:Club[];players:Player[];slots:Slot[];stints:Stint[];rosters:Roster[];matches:Match[];stats:(Stat&{match_id:string})[];reports:Report[];club_summaries:ClubSummary[];player_summaries:PlayerSummary[];admin:boolean};
export type TeamRank={id:string;pj:number;wins:number;draws:number;losses:number;gf:number;ga:number;gd:number;points:number};
export type PlayerRank={id:string;appearances:number|null;goals:number|null;assists:number|null;rating:number|null;clean_sheets:number|null;saves:number|null;conceded:number|null;goals_known:number;records:number};
export type Rankings={teams:TeamRank[];players:PlayerRank[]};
export const phases=[['regular','Liga regular'],['quarter','Cuartos de final'],['semi','Semifinal'],['final','Final'],['other','Otra eliminatoria']];

