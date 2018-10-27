import { Injectable } from '@angular/core';
import { User } from './user';
import { ApiService } from '../api.service';
import { Observable, Observer, Subject } from 'rxjs';
import { ApolloQueryResult } from 'apollo-client';
import { UserInterface, UsersQueryInterface } from './user.interface';
import { LoginResult } from '../login/login.service';
import { ExtendMessage } from '../socket.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  protected currentUser: User;
  protected usersByRoom: {[room: string]: User} = {};
  protected usersById: {[id: number]: User} = {};
  protected usersByEmail: {[email: string]: User} = {};
  protected readonly userDataFields = `
    id
    firstname
    lastname
    name
    room
    games {
      name
    }
  `;

  constructor(private api: ApiService) {
    api.getMessages().subscribe((message: ExtendMessage<UserInterface>) => {
      if (message.action === 'extend') {
        const user = this.getRegisteredUser({room: message.room});
        if (user) {
          user.extend(message.properties);
          const subscription = user.getSubscription();
          if (subscription) {
            subscription.next(user);
          }
        }
      }
    });
  }

  invalidCurrentUser() {
    if (this.currentUser.room) {
      this.api.leave(this.currentUser.room);
    }
    this.currentUser = null;
  }

  login(email: string, password: string, remember?: boolean): Promise<User | null> {
    return new Promise(resolve => {
      this.api.mutate<LoginResult>('login', {
        email,
        password,
        remember,
      }, this.userDataFields).subscribe((result: ApolloQueryResult<LoginResult>) => {
        if (!result.data.login) {
          resolve(null);

          return;
        }

        const user = new User(result.data.login, null, (properties: UserInterface) => {
          properties.id = user.id;
          this.api.mutate<{updateUser: UserInterface}>('updateUser', properties, 'updated_at').subscribe((updateResult: ApolloQueryResult<{updateUser: UserInterface}>) => {
            user.updated_at = updateResult.data.updateUser.updated_at;
          });
        });
        this.registerUser(user, true);
        resolve(user);
      });
    });
  }

  logout() {
    this.invalidCurrentUser();

    return this.api.mutate('logout');
  }

  unregisterUser(user: User) {
    if (user.email && this.usersByEmail[user.email]) {
      delete this.usersByEmail[user.email];
    }
    if (user.id && this.usersByEmail[user.id]) {
      delete this.usersByEmail[user.id];
    }
    if (user.room) {
      if (this.usersByRoom[user.room]) {
        delete this.usersByRoom[user.room];
      }
      this.api.leave(user.room);
    }
    user.kill();
  }

  registerUser(user: User, markAsCurrentUser?: boolean) {
    if (markAsCurrentUser) {
      this.currentUser = user;
    }
    if (user.email) {
      this.usersByEmail[user.email.toLowerCase()] = user;
    }
    if (user.id) {
      this.usersById[(user.id + '').toLowerCase()] = user;
    }
    if (user.room) {
      this.usersByRoom[user.room] = user;
      this.api.join(user.room);
    }
  }

  getRegisteredUser(parameters: object): User | null {
    if (parameters['current'] && this.currentUser) {
      return this.currentUser;
    }
    if (parameters['email']) {
      const email = parameters['email'].toLowerCase();
      if (this.usersByEmail[email]) {
        return this.usersByEmail[email];
      }
    }
    if (parameters['id']) {
      const id = (parameters['id'] + '').toLowerCase();
      if (this.usersById[id]) {
        return this.usersById[id];
      }
    }
    if (parameters['room'] && this.usersByRoom[parameters['room']]) {
      return this.usersByRoom[parameters['room']];
    }

    return null;
  }

  get(parameters: object): Subject<User> {
    let user: User;
    const observable = new Observable((userSubscription: Observer<User>) => {
      const registeredUser = this.getRegisteredUser(parameters);
      if (registeredUser) {
        userSubscription.next(registeredUser);

        return;
      }

      this.api.query('users', parameters, this.userDataFields).subscribe((result: ApolloQueryResult<UsersQueryInterface>) => {
        if (!result.data.users.data[0]) {
          userSubscription.next(null);
          return;
        }
        user = new User(result.data.users.data[0], userSubscription, (properties: UserInterface) => {
          properties.id = user.id;
          this.api.mutate<{updateUser: UserInterface}>('updateUser', properties, 'updated_at').subscribe((updateResult: ApolloQueryResult<{updateUser: UserInterface}>) => {
            user.updated_at = updateResult.data.updateUser.updated_at;
          });
        });
        this.registerUser(user, parameters['current']);
        userSubscription.next(user);
      });
    });

    const observer = {
      next: (updateUser: User) => {
        if (user) {
          let touched = false;
          const properties = {};
          Object.keys(updateUser).forEach(key => {
            if (updateUser[key] !== user[key]) {
              properties[key] = updateUser[key];
              touched = true;
            }
          });
          if (touched) {
            user.update(properties);
          }
        }
      },
    };

    return Subject.create(observer, observable);
  }

  getCurrent(): Subject<User | null> {
    return this.get({current: true});
  }

  getById(id: number): Subject<User | null> {
    return this.get({id});
  }

  getByEmail(email: string): Subject<User | null> {
    return this.get({email});
  }

  update(id: number, properties: object) {
    return new Promise(resolve => {
      this.getById(id).subscribe((user: User) => {
        resolve(user.update(properties));
      });
    });
  }
}
