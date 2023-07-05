import React, { useCallback, useMemo, useState } from "react";
import { json, redirect } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import { shopify } from "../shopify.server";
import {
  Card,
  Bleed,
  Button,
  ChoiceList,
  Divider,
  EmptyState,
  HorizontalStack,
  InlineError,
  Layout,
  Link,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
  VerticalStack,
} from "@shopify/polaris";
import { ResourcePicker, ContextualSaveBar } from "@shopify/app-bridge-react";
import { ImageMajor } from "@shopify/polaris-icons";

import db from "../db.server";
import { getQRCode } from "../models/QRCode";

export async function loader({ request, params }) {
  const { admin, sessionToken } = await shopify.authenticate.admin(request);
  const { body } = await admin.graphql.query({
    data: {
      query: DISCOUNT_QUERY,
      variables: {
        first: 10,
      },
    },
  });

  const discounts = body.data.codeDiscountNodes.nodes.map(
    ({ id, codeDiscount }) => ({
      label: codeDiscount.codes.nodes[0].code,
      value: id,
    })
  );

  const qrCodeId = params.id === "new" || !params.id ? null : Number(params.id);

  return json({
    discounts,
    createDiscountUrl: `${sessionToken.iss}/discounts/new`,
    qrCode: qrCodeId ? await getQRCode(qrCodeId) : null,
  });
}

export async function action({ request, params }) {
  const { session } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const data = {
    title: formData.get("title"),
    shop: session.shop,
    productId: formData.get("productId"),
    productHandle: formData.get("productHandle"),
    productVariantId: formData.get("productVariantId"),
    productAlt: formData.get("productAlt"),
    productImage: formData.get("productImage"),
    discountId: formData.get("discountId"),
    discountCode: formData.get("discountCode"),
    destination: formData.get("destination"),
  };

  const requiredFieldMessages = {
    title: "Title is required",
    productId: "Product is required",
    destination: "Destination is required",
  };

  const errors = Object.entries(requiredFieldMessages).reduce(
    (errors, [field, message]) => {
      if (!data[field]) {
        errors[field] = message;
      }

      return errors;
    },
    {}
  );

  if (Object.keys(errors).length) {
    return json({ errors }, { status: 422 });
  }

  const id = params.id === "new" || !params.id ? undefined : Number(params.id);

  const qrCode = id
    ? await db.qRCode.update({ where: { id }, data })
    : await db.qRCode.create({ data });

  return redirect(`/qrcodes/${qrCode.id}`);
}

export default function Index() {
  const { discounts, createDiscountUrl, qrCode } = useLoaderData();
  const errors = useActionData()?.errors || {};

  const [title, setTitle] = useState(qrCode?.title || "");
  const [destination, setDestination] = useState([
    qrCode?.destination || "product",
  ]);
  const [discount, setDiscount] = useState(qrCode?.discountId || "none");
  const [product, setProduct] = useState({
    image: {
      alt: qrCode?.productAlt || "",
      src: qrCode?.productImage || "",
    },
    handle: qrCode?.productHandle || "",
    id: qrCode?.productId || "",
    variantId: qrCode?.productVariantId || "",
  });

  const [showResourcePicker, setShowResourcePicker] = useState(false);

  const handleProductChange = useCallback(({ selection }) => {
    const { images, handle, id, variants } = selection[0];

    setProduct({
      image: {
        alt: images[0]?.altText,
        src: images[0]?.imageSrc || images[0]?.originalSrc,
      },
      handle,
      id,
      variantId: variants[0].id,
    });

    setShowResourcePicker(false);
  }, []);

  const [cleanState, setCleanState] = useState({
    title,
    destination,
    discount,
    product,
  });

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(cleanState) !==
      JSON.stringify({
        title,
        destination,
        discount,
        product,
      })
    );
  }, [cleanState, title, destination, discount, product]);

  const resetForm = useCallback(() => {
    setTitle(cleanState.title);
    setDestination(cleanState.destination);
    setDiscount(cleanState.discount);
    setProduct(cleanState.product);
  }, [cleanState]);

  const submit = useSubmit();
  const handleSubmit = () => {
    const data = {
      title,
      destination: destination[0],
      productId: product.id,
      productHandle: product.handle,
      productVariantId: product.variantId,
    };

    if (discount !== "none") {
      data.discountId = discount;
      data.discountCode =
        discounts.find((d) => d.value === discount)?.label || "";
    }

    if (product.image.src) {
      data.productImage = product.image.src;
    }

    if (product.image.alt) {
      data.productAlt = product.image.alt;
    }

    submit(data, { method: "post" });
    setCleanState({
      title,
      destination,
      discount,
      product,
    });
  };

  const { state } = useNavigation();
  const isSubmitting = state === "submitting";

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <VerticalStack gap="5">
            <Card>
              <VerticalStack gap="5">
                <Text as={"h2"} variant="headingLg">
                  Title
                </Text>
                <TextField
                  id="title"
                  helpText="Only store staff can see this title"
                  label="title"
                  labelHidden
                  autoComplete="off"
                  value={title}
                  onChange={setTitle}
                  error={errors.title}
                />
              </VerticalStack>
            </Card>
            <Card>
              <VerticalStack gap="5">
                <HorizontalStack align="space-between">
                  <Text as={"h2"} variant="headingLg">
                    Product
                  </Text>
                  {product.id ? (
                    <Button
                      plain
                      onClick={() => setShowResourcePicker(!showResourcePicker)}
                    >
                      {product.id ? "Change product" : "Select product"}
                    </Button>
                  ) : null}
                  <ResourcePicker
                    resourceType="Product"
                    showVariants={false}
                    selectMultiple={false}
                    onCancel={() => {
                      setShowResourcePicker(false);
                    }}
                    onSelection={handleProductChange}
                    open={showResourcePicker}
                  />
                </HorizontalStack>
                {product.handle ? (
                  <HorizontalStack blockAlign="center" gap={"5"}>
                    <Thumbnail
                      source={product.image.src || ImageMajor}
                      alt={product.image.alt}
                    />
                    <Text as="span" variant="headingMd" fontWeight="semibold">
                      {product.handle}
                    </Text>
                  </HorizontalStack>
                ) : (
                  <VerticalStack gap="2">
                    <Button
                      onClick={() => setShowResourcePicker(true)}
                      id="select-product"
                    >
                      Select product
                    </Button>
                    {errors.productId ? (
                      <InlineError
                        message={errors.productId}
                        fieldID="myFieldID"
                      />
                    ) : null}
                  </VerticalStack>
                )}
                <Bleed marginInline="20">
                  <Divider />
                </Bleed>
                <ChoiceList
                  title="Scan destination"
                  choices={[
                    { label: "Link to product page", value: "product" },
                    {
                      label: "Link to checkout page with product in the cart",
                      value: "cart",
                    },
                  ]}
                  selected={destination}
                  onChange={setDestination}
                  error={errors.destination}
                />
              </VerticalStack>
            </Card>
            <Card>
              <VerticalStack gap="5">
                <HorizontalStack align="space-between">
                  <Text as={"h2"} variant="headingLg">
                    Discount
                  </Text>
                  <Link
                    onClick={() => window.shopify.redirectTo(createDiscountUrl)}
                  >
                    Create discount
                  </Link>
                </HorizontalStack>
                <Select
                  id="discount"
                  label="Discount"
                  labelHidden
                  options={[
                    { label: "No discount", value: "none" },
                    ...discounts,
                  ]}
                  onChange={setDiscount}
                  value={discount}
                />
              </VerticalStack>
            </Card>
          </VerticalStack>
        </Layout.Section>
        <Layout.Section secondary>
          <Card>
            <Text as={"h2"} variant="headingLg">
              Qr code
            </Text>
            {qrCode ? (
              <EmptyState image={qrCode.image} imageContained={true} />
            ) : (
              <EmptyState image="">
                Your QR code will appear here after you save
              </EmptyState>
            )}
            <VerticalStack gap="5">
              <Button disabled={!qrCode} url={qrCode?.image} download primary>
                Download
              </Button>
              <Button url={qrCode?.destinationUrl} external>
                Go to destination
              </Button>
            </VerticalStack>
          </Card>
        </Layout.Section>
      </Layout>
      <ContextualSaveBar
        saveAction={{
          label: "Save",
          onAction: handleSubmit,
          loading: isSubmitting,
          disabled: isSubmitting,
        }}
        discardAction={{
          label: "Discard",
          onAction: resetForm,
          loading: isSubmitting,
          disabled: !isDirty || isSubmitting,
        }}
        visible={isDirty || isSubmitting}
        fullWidth
      />
    </Page>
  );
}

const DISCOUNT_QUERY = `
  query shopData($first: Int!) {
    codeDiscountNodes(first: $first) {
      nodes {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
          ... on DiscountCodeBxgy {
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
          ... on DiscountCodeFreeShipping {
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
        }
      }
    }
  }
`;