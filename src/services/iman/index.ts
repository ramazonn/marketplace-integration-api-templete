import { OrderEntity, OrderItemEntity } from '@ubaytools/core';
import axios from 'axios';
import { Cookie, CookieJar } from 'tough-cookie';
const jar = new CookieJar();
  
export class ImanService { 
    static instance: ImanService;
    static url = process.env.IMAN_URL;

    private constructor() {}

    static getInstance(): ImanService {
        if (!ImanService.instance) {
            ImanService.instance = new ImanService();
        }
        return ImanService.instance;
    }

    async login(): Promise<any> {
        try {
            const body = {
                username: process.env.IMAN_USERNAME,
                password: process.env.IMAN_PASSWORD,
            };
            const response = await axios.post(`${ImanService.url}/v1/auth/login`, body);
            const access_token_ttl = response?.data?.access_token_ttl ?? 3600 * 1000;
            const refresh_token_ttl = response?.data?.refresh_token_ttl ?? 120 * 1000;
            jar.setCookieSync(`access_token=${response.data.access_token}; Path=/`, ImanService.url).setExpires(new Date(Date.now() + access_token_ttl));
            jar.setCookieSync(`refresh_token=${response.data.refresh_token}; Path=/`, ImanService.url).setExpires(new Date(Date.now() + refresh_token_ttl));

            return response.data;
        } catch (error) {
            throw error;
        };
    }
 
    async refreshToken(refresh_token: string): Promise<any> {
        try {
            const body = {
                refresh_token: refresh_token,
            };
            
            const response = await axios.post(`${ImanService.url}/v1/auth/refresh-token`, body);
            const access_token_ttl = response?.data?.access_token_ttl ?? 3600 * 1000;
            const refresh_token_ttl = response?.data?.refresh_token_ttl ?? 120 * 1000;
            jar.setCookieSync(`access_token=${response.data.access_token}; Path=/`, ImanService.url).setExpires(new Date(Date.now() + access_token_ttl));
            jar.setCookieSync(`refresh_token=${response.data.refresh_token}; Path=/`, ImanService.url).setExpires(new Date(Date.now() + refresh_token_ttl));
            
            return response.data;
        } catch (error) {
            throw error;
        };
    }

    async getAccessToken(): Promise<string> {
        try {
            const coockies = jar.getCookiesSync(ImanService.url);
            let result: string | null = null;

            let access_token: Cookie = coockies.find((cookie: any) => cookie?.key === 'access_token')
            
            if (!access_token) {
                const refresh_token:Cookie = coockies.find((cookie: any) => cookie?.key === 'refresh_token')
                if (!refresh_token) { 
                    console.log('3. refresh token not found');
                    const loginResponse = await this.login();
                    console.log('3. send access token from login response', loginResponse);
                    
                    result = loginResponse?.access_token;
                } else {
                    const refreshResponse = await this.refreshToken(refresh_token.value);
                    result = refreshResponse?.access_token;
                }
            } else {
                result = access_token.value;
            }

            return result;
        } catch (error) {
            throw error;
        }
    }

    async createBasket(order: OrderEntity): Promise<any> {
        try {
            /**
             * Error: Request failed with status code 401 : authorization error
             * Error: Request failed with status code 409 : conflict (external_order_id already exists)
             * Error: Request failed with status code 404 : basket source doesnt have markup
             */
            const access_token = await this.getAccessToken();
            const items = order.getItems().map((item: OrderItemEntity) => {
                return {
                    barcode: item.getBarcode(),
                    category: item.getProductName().getUz(),//item.getCategory(),
                    mark_kiz: '',//item.getMarkKiz(),
                    merchant_product_id: item.getProductId().toString(),
                    model: item.getBrand(),
                    name: item.getProductName().getUz(),
                    price: item.getFinalPrice(),
                    quantity: item.getQuantity(),
                    spic: '08517001001000000',//item.getSpic(),
                }
            })
            const body = {
                client_phone: order.getUserData()?.getPhoneNumber() ?? '',
                external_order_id: order.getOrderCode().toString() ?? '',                
                items: items,
            }
            
            const response = await axios.post(`${ImanService.url}/v1/baskets/create-qr`, body,
                {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                }
                }
            );
            console.log('+ response', response.data);
            /**
             * Response:
             * {
                "data": {
                        "guid": "73c7b0b3-c330-4136-9dc5-09a5fddda301",
                        "client_phone": "998991337153",
                        "total_price": 230000,
                        "merchant_id": "a8641534-b507-4ecd-8d95-ca0660fa5dc5",
                        "reference": {
                            "qr_code": "https://dev.cdn.iman.imaninvest.com/documents/73c7b0b3-c330-4136-9dc5-09a5fddda301-qr_deep_link.png",
                            "deep_link": "https://pay.imaninvest.com/deeplink?basket_id=73c7b0b3-c330-4136-9dc5-09a5fddda301",
                            "qr_deep_link": "https://dev.cdn.iman.imaninvest.com/documents/73c7b0b3-c330-4136-9dc5-09a5fddda301-qr_deep_link.png"
                        },
                        "merchant_meta": {
                            "merchant_id": "a8641534-b507-4ecd-8d95-ca0660fa5dc5",
                            "branch_id": "71b22b40-9926-44b5-b550-e7108ca4f7e5",
                            "pos_agent_id": "dc94aaae-cf77-4c99-b0c4-c7a11804e303"
                        },
                        "items": [
                            {
                                "id": 32965,
                                "name": "Xiaomi Mi Wi-Fi Router 4C R4CM white",
                                "model": "",
                                "category": "Кухонный комбайн",
                                "price": 230000,
                                "quantity": 1,
                                "merchant_product_id": "1",
                                "spic": "08517001001000000",
                                "barcode": ""
                            }
                        ]
                    }
                }
             */
            return response.data;
        } catch (error) {
            console.log('+ error', error?.response?.data?.errors, error?.data);
            throw error;
        }
    }
}