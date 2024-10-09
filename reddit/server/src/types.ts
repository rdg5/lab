import {
  Generated,
  Selectable,
} from 'kysely'

export interface Db {
  post: PostTable
}

export interface PostTable {
		id: Generated<bigint>;
		title: string;
		url: string;
		voteCount: Generated<bigint>;
	}

export type Post = Selectable<PostTable>