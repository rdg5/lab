import {
  ColumnType,
  Generated,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
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



