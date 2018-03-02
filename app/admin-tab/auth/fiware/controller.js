import Ember from 'ember';
import C from 'ui/utils/constants';
import { denormalizeName } from 'ui/services/settings';

export default Ember.Controller.extend({
  fiware                  : Ember.inject.service(),
  endpoint                : Ember.inject.service(),
  access                  : Ember.inject.service(),
  settings                : Ember.inject.service(),
  fiwareConfig            : Ember.computed.alias('model.fiwareConfig'),

  confirmDisable          : false,
  errors                  : null,
  testing                 : false,
  error                   : null,
  saved                   : false,
  saving                  : false,
  haveToken               : false,

  organizations           : null,
  scheme                  : Ember.computed.alias('fiwareConfig.scheme'),
  isEnterprise: false,
  secure : true,

  createDisabled: function() {
    if (!this.get('haveToken')) {
      return true;
    }
    if ( this.get('isEnterprise') && !this.get('fiwareConfig.hostname') )
    {
      return true;
    }

    if ( this.get('testing') )
    {
      return true;
    }

  }.property('fiwareConfig.{clientId,clientSecret,hostname}','testing','isEnterprise', 'haveToken'),

  providerName: function() {
    if ( !!this.get('fiwareConfig.hostname') ) {
      return 'authPage.fiware.enterprise';
    } else {
      return 'authPage.fiware.standard';
    }
  }.property('fiwareConfig.hostname'),

  numUsers: function() {
    return this.get('model.allowedIdentities').filterBy('externalIdType',C.PROJECT.TYPE_GITHUB_USER).get('length');
  }.property('model.allowedIdentities.@each.externalIdType','wasRestricted'),

  numOrgs: function() {
    return this.get('model.allowedIdentities').filterBy('externalIdType',C.PROJECT.TYPE_GITHUB_ORG).get('length');
  }.property('model.allowedIdentities.@each.externalIdType','wasRestricted'),

  destinationUrl: function() {
    return window.location.origin+'/';
  }.property(),

  updateEnterprise: function() {
    if ( this.get('isEnterprise') ) {
      var match;
      var hostname = this.get('fiwareConfig.hostname')||'';

      if ( match = hostname.match(/^http(s)?:\/\//i) ) {
        this.set('secure', ((match[1]||'').toLowerCase() === 's'));
        hostname = hostname.substr(match[0].length).replace(/\/.*$/,'');
        this.set('fiwareConfig.hostname', hostname);
      }

    }
    else
    {
      this.set('fiwareConfig.hostname', null);
      this.set('secure', true);
    }

    this.set('scheme', this.get('secure') ? 'https://' : 'http://');
  },

  enterpriseDidChange: function() {
    Ember.run.once(this,'updateEnterprise');
  }.observes('isEnterprise','fiwareConfig.hostname','secure'),

  protocolChoices: [
    {label: 'https:// -- Requires a cert from a public CA', value: 'https://'},
    {label: 'http://', value: 'http://'},
  ],

  actions: {
    save: function() {
      this.send('clearError');
      this.set('saving', true);

      let fiwareConfig = Ember.Object.create(this.get('fiwareConfig'));
      fiwareConfig.setProperties({
        'clientId'          : (fiwareConfig.get('clientId')||'').trim(),
        'clientSecret'      : (fiwareConfig.get('clientSecret')||'').trim(),
        'redirecturi'      : (fiwareConfig.get('redirecturi')||'').trim(),
      });


      this.get('model').setProperties({
        'provider'          : 'fiwareconfig',
        'enabled'           : true, // It should already be, but just in case..
        'accessMode'        : 'unrestricted',
        'allowedIdentities' : [],
      });

      this.get('fiware').setProperties({
        hostname : fiwareConfig.get('hostname'),
        scheme   : fiwareConfig.get('scheme'),
        clientId : fiwareConfig.get('clientId')
      });

      this.get('model').save().then((/*resp*/) => {
        // we need to go get he new token before we open the popup
        // if you've authed with any other services in v1-auth
        // the redirect token will be stale and representitive
        // of the old auth method
        this.get('fiware').getToken().then((resp) => {
          this.get('access').set('token', resp);
          this.setProperties({
            saving: false,
            saved: true,
            haveToken: true,
          });
          $('#loading-underlay, #loading-overlay').removeClass('hide').show();
          setTimeout(function() {
            window.location.href = "/login";
          }, 2000);
        }).catch((err) => {
          this.setProperties({
            saving: false,
            saved: false,
            haveToken: false,
          });
          this.send('gotError', err);
        });
      }).catch(err => {
          this.setProperties({
            saving: false,
            saved: false,
            haveToken: false,
          });
        this.send('gotError', err);
      });
    },

    authenticate: function() {
      this.send('clearError');
      this.set('testing', true);
      this.get('fiware').authorizeTest((err,code) => {
        if ( err )
        {
          this.send('gotError', err);
          this.set('testing', false);
        }
        else
        {
          this.send('gotCode', code);
          this.set('testing', false);
        }
      });
    },

    gotCode: function(code) {
      this.get('access').login(code).then(res => {
        this.send('authenticationSucceeded', res.body);
      }).catch(res => {
        // Fiware auth succeeded but didn't get back a token
        this.send('gotError', res.body);
      });
    },

    authenticationSucceeded: function(auth) {
      this.send('clearError');
      this.set('organizations', auth.orgs);

      let model = this.get('model').clone();
      model.setProperties({
        'enabled': true,
        'accessMode': 'unrestricted',
        'allowedIdentities': [auth.userIdentity],
      });

      let url = window.location.href;

      model.save().then(() => {
        // Set this to true so the token will be sent with the request
        this.set('access.enabled', true);

        return this.get('userStore').find('setting', denormalizeName(C.SETTING.API_HOST)).then((setting) => {
          if ( setting.get('value') )
          {
            this.send('waitAndRefresh', url);
          }
          else
          {
            // Default the api.host so the user won't have to set it in most cases
            if ( window.location.hostname === 'localhost' ) {
              this.send('waitAndRefresh', url);
            } else {
              setting.set('value', window.location.origin);
              return setting.save().then(() => {
                this.send('waitAndRefresh', url);
              });
            }
          }
        });
      }).catch((err) => {
        this.set('access.enabled', false);
        this.send('gotError', err);
      });
    },

    waitAndRefresh: function(url) {
      $('#loading-underlay, #loading-overlay').removeClass('hide').show();
      setTimeout(function() {
        window.location.href = url || window.location.href;
      }, 1000);
    },

    promptDisable: function() {
      this.set('confirmDisable', true);
      Ember.run.later(this, function() {
        this.set('confirmDisable', false);
      }, 10000);
    },

    gotError: function(err) {
      if ( err.message )
      {
        this.send('showError', err.message + (err.detail? '('+err.detail+')' : ''));
      }
      else
      {
        this.send('showError', 'Error ('+err.status + ' - ' + err.code+')');
      }

      this.set('testing', false);
    },

    showError: function(msg) {
      this.set('errors', [msg]);
      window.scrollY = 10000;
    },

    clearError: function() {
      this.set('errors', null);
    },

    disable: function() {
      this.send('clearError');

      let model = this.get('model').clone();
      model.setProperties({
        'allowedIdentities': [],
        'accessMode': 'unrestricted',
        'enabled': false,
        'fiwareConfig': {
          'hostname': null,
          'clientSecret': '',
        }
      });

      model.save().then(() => {
        this.get('access').clearSessionKeys();
        this.set('access.enabled',false);
        this.send('waitAndRefresh');
      }).catch((err) => {
        this.send('gotError', err);
      }).finally(() => {
        this.set('confirmDisable', false);
      });
    },
  },
});
