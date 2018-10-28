import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: '/games', pathMatch: 'full' },
  { path: 'play/:id/:code', loadChildren: './game/loader.module#GameLoaderModule' },
  { path: 'games', loadChildren: './games-list/loader.module#GamesListLoaderModule' },
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(routes),
  ],
  declarations: [],
})
export class AppRoutingModule {
}
