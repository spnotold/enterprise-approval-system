package edu.zju.eas.service.app;

import edu.zju.eas.model.app.Application;
import edu.zju.eas.security.CurrentUser;
import edu.zju.eas.service.flow.BizHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BusinessHandlersConfig {
    @Bean BizHandler purchaseHandler(BusinessDataService data){return handler("PURCHASE",data);}
    @Bean BizHandler travelHandler(BusinessDataService data){return handler("TRAVEL",data);}
    @Bean BizHandler expenseHandler(BusinessDataService data){return handler("EXPENSE",data);}
    @Bean BizHandler customHandler(BusinessDataService data){return handler("CUSTOM",data);}
    private BizHandler handler(String type,BusinessDataService data){return new BizHandler(){
        public String type(){return type;}
        public SubmitData prepareSubmit(Application app,CurrentUser user){return data.prepare(app,user,true);}
        public SubmitData previewVariables(Application app){return data.prepare(app,null,false);}
    };}
}
