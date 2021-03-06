import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ApolloQueryResult } from 'apollo-client';
import { ApiService } from '../api.service';
import { User } from '../user/user';
import { LoginService } from './login.service';
import { IOauth, IOauthQuery } from './oauth.interface';

function concatQueryParams(base: string, params: string | null) {
  return base + (params ? (base.indexOf('?') === -1 ? '?' : '&') + params : '');
}

const baseUrl = location.href.replace(/[?&](oauthError|error|oauthRedirect)(=[^&]+)?/g, '');

/**
 * Allow the use to log in the application via dedicated credentials or OAuth (Facebook, Twitter, Google, etc.).
 * <example-url>/doc/login/login-options?no-menu</example-url>
 *
 * @link https://ovnigames.selfbuild.fr/documentation/components/LoginComponent.html
 *
 * @example
 * <og-login></og-login>
 *
 * @example
 * <og-login
 *                [allowRemember]="true"
 *                [allowLogin]="true"
 *                [allowOAuth]="true"
 *                [oAuthExclusion]="['facebook', 'twitter']"
 *                [oAuthList]="['google', 'twitter', 'github']"
 * ></og-login>
 */
@Component({
  selector: 'og-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  /**
   * Enable [remember] checkbox to log the user automatically on next browsing session.
   */
  @Input() public allowRemember = true;

  /**
   * Enable credentials authentication.
   */
  @Input() public allowLogin = true;

  /**
   * Enable OAuth authentication (such as Facebook, Twitter, Google, LinkedIn, GitHub, Bitbucket).
   */
  @Input() public allowOAuth = true;

  /**
   * Array of OAuth service IDs to exclude from the buttons bar.
   */
  @Input() public oAuthExclusion: string[] = [];

  /**
   * Array of OAuth service IDs to include from the buttons bar (all possible included if null).
   * This property also allow you to order buttons in your preferred way.
   */
  @Input() public oAuthList: null|string[] = null;

  /**
   * Additional scope for OAuth.
   */
  @Input() public oAuthScope: null|string[] = null;

  /**
   * Flatten the card design (no shadow, no padding, no margin on the main container).
   */
  @Input() public flat = false;

  /**
   * Event triggered with a user successfully logged in.
   */
  @Output() public userLoggedIn: EventEmitter<User> = new EventEmitter<User>();

  /**
   * @ignore
   */
  public loading = true;

  /**
   * @ignore
   */
  public oAuthLoading = true;

  /**
   * @ignore
   */
  public remember = false;

  /**
   * @ignore
   */
  public email = new FormControl('', [Validators.required, Validators.email]);

  /**
   * @ignore
   */
  public password = new FormControl('', [Validators.required]);

  /**
   * @ignore
   */
  public oauth = new FormControl('');

  /**
   * @ignore
   */
  public oauthServices: IOauth[];

  private readonly oauthRedirectUrl = concatQueryParams(baseUrl, 'oauthRedirect');
  private readonly oauthErrorUrl = concatQueryParams(baseUrl, 'oauthError');

  /**
   * @ignore
   */
  constructor(private loginService: LoginService, private api: ApiService, private http: HttpClient, private sanitizer: DomSanitizer) {
  }

  /**
   * @ignore
   */
  public ngOnInit(): void {
    if (location.href.indexOf('oauthError') !== -1) {
      this.oauth.setErrors({oauthError: true});
    }
    this.loading = false;
    if (!this.allowOAuth) {
      this.oAuthLoading = false;

      return;
    }

    this.loginService.getOauthService().subscribe((result: ApolloQueryResult<IOauthQuery>) => {
      const list = {};
      this.oauthServices = result.data.oauth.data.filter(service => {
        if (this.oAuthList && this.oAuthList.indexOf(service.code) === -1) {
          return false;
        }

        return this.oAuthExclusion.indexOf(service.code) === -1;
      }).map(service => {
        service.login = concatQueryParams(
          service.login,
          `redirect_url=${encodeURIComponent(this.oauthRedirectUrl)}&error_url=${encodeURIComponent(this.oauthErrorUrl)}`
        );

        if (this.oAuthList) {
          list[service.code] = service;
        }

        return service;
      });
      if (this.oAuthList) {
        this.oauthServices = this.oAuthList.map(code => list[code]);
      }
      Promise.all(this.oauthServices.map(service => {
        return new Promise(resolve => {
          this.http.get(
            (service.icon.charAt(0) === '/' ? this.api.getAssetPrefix() : '') + service.icon,
            {responseType: 'text'}
          ).subscribe((svgBody: string) => {
            service.svg = this.sanitizer.bypassSecurityTrustHtml(svgBody);
            resolve();
          });
        });
      })).then(() => {
        this.oAuthLoading = false;
      });
    });
  }

  public loginHref(href: string): string {
    const prefix = this.api.getAssetPrefix();

    if (href.charAt(0) === '/' && prefix) {
      href = concatQueryParams(
        prefix + href,
        'origin=' + encodeURIComponent(location.origin || location.protocol + '//' + location.host)
      );
    }

    if (this.oAuthScope && this.oAuthScope.length) {
      href = concatQueryParams(
        href,
        'scope=' + encodeURIComponent(this.oAuthScope.join(','))
      );
    }

    return href;
  }

  /**
   * Trigger credentials login with form input data.
   */
  public login(): void {
    this.loading = true;
    this.loginService.login(this.email.value, this.password.value, this.remember).then((user: User | null) => {
      this.loading = false;

      if (user) {
        this.auth(user);

        return;
      }

      this.email.setErrors({
        badLogin: true,
      });
    });
  }

  /**
   * Send the logged in user event.
   *
   * @param user logged in user.
   */
  public auth(user: User): void {
    this.userLoggedIn.emit(user);
  }

  /**
   * Returns the email address error message a string or empty string if valid.
   */
  public getEmailErrorMessage(): string {
    if (this.email.hasError('required')) {
      return 'You must enter a value';
    }

    if (this.email.hasError('email')) {
      return 'Not a valid email';
    }

    if (this.email.hasError('badLogin')) {
      return 'Wrong e-mail address or password';
    }

    return '';
  }

  /**
   * Returns the password error message a string or empty string if valid.
   */
  public getPasswordErrorMessage(): string {
    return this.password.hasError('required') ?
      'You must enter a value' :
      '';
  }
}
